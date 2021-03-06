import {
  BuilderContext,
  createBuilder,
  BuilderOutput,
  targetFromTargetString,
  scheduleTargetAndForget,
} from '@angular-devkit/architect';
import { JsonObject } from '@angular-devkit/core';
import { Observable, of, from } from 'rxjs';
import { concatMap, tap } from 'rxjs/operators';
import { stripIndents } from '@angular-devkit/core/src/utils/literals';
import { ServerlessBuildEvent } from '../build/build.impl';
import * as _ from 'lodash';
import { ServerlessWrapper } from '../../utils/serverless';
/* Fix for EMFILE: too many open files on serverless deploy */
import * as fs from 'fs';
import * as gracefulFs from 'graceful-fs';
import { preparePackageJson } from '../../utils/packagers';
import { runWaitUntilTargets, startBuild } from '../../utils/target.schedulers';
gracefulFs.gracefulify(fs);
/* Fix for EMFILE: too many open files on serverless deploy */
export const enum InspectType {
  Inspect = 'inspect',
  InspectBrk = 'inspect-brk',
}

// review: Have to spin off options and clarify schema.json for deploy,build,serve
export interface ServerlessDeployBuilderOptions extends JsonObject {
  inspect: boolean | InspectType;
  waitUntilTargets: string[];
  buildTarget: string;
  function: string;
  host: string;
  port: number;
  watch: boolean;
  args: string[];
  package: string;
  location: string;
  stage: string;
  list: boolean;
  updateConfig: boolean;
  verbose?: boolean;
  sourceRoot?: string;
  root?: string;
}

export default createBuilder<ServerlessDeployBuilderOptions & JsonObject>(
  serverlessExecutionHandler
);
export function serverlessExecutionHandler(
  options: JsonObject & ServerlessDeployBuilderOptions,
  context: BuilderContext
): Observable<BuilderOutput> {
  // build into output path before running serverless offline.
  return runWaitUntilTargets(options.waitUntilTargets, context).pipe(
    concatMap((v) => {
      if (!v.success) {
        context.logger.error(
          'One of the tasks specified in waitUntilTargets failed'
        );
        return of({ success: false });
      }
      return startBuild(options, context);
    }),
    concatMap((event: ServerlessBuildEvent) => {
      if (event.success) {
        return preparePackageJson(
          options,
          context,
          event.webpackStats,
          event.resolverName,
          event.tsconfig
        );
      } else {
        context.logger.error('There was an error with the build. See above.');
        context.logger.info(`${event.outfile} was not restarted.`);
        return of({
          success: false,
          error: `${event.outfile} was not restarted.`,
        });
      }
    }),
    concatMap((result) => {
      if (result.success) {
        // change servicePath to distribution location
        // review: Change options from location to outputpath?\
        const servicePath = ServerlessWrapper.serverless.config.servicePath;
        const args = getExecArgv(options);
        ServerlessWrapper.serverless.config.servicePath = options.location;
        ServerlessWrapper.serverless.processedInput = {
          commands: ['deploy'],
          options: args,
        };
        return new Observable<BuilderOutput>((option) => {
          ServerlessWrapper.serverless
            .run()
            .then(() => {
              // change servicePath back for further processing.
              ServerlessWrapper.serverless.config.servicePath = servicePath;
              option.next({ success: true });
              option.complete();
            })
            .catch((ex) => {
              option.next({ success: false, error: ex.toString() });
              option.complete();
            });
        }).pipe(
          concatMap((result) => {
            return of(result);
          })
        );
      } else {
        context.logger.error(
          `There was an error with the build. ${result.error}.`
        );
        return of(result);
      }
    })
  );
}

export function getExecArgv(options: ServerlessDeployBuilderOptions) {
  const args = [];
  if (options.function && options.function != '') {
    args.push('function');
  }
  if (options.list) {
    args.push('list');
  }
  for (const key in options) {
    if (options.hasOwnProperty(key)) {
      if (
        options[key] !== undefined &&
        key !== 'buildTarget' &&
        key !== 'package' &&
        key !== 'list'
      ) {
        args.push(`--${key} ${options[key]}`);
      }
    }
  }
  return args;
}
