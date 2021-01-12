import { packager } from './index';
import { NPM } from './npm';
import { Yarn } from './yarn';

describe('Packagers', () => {
  describe('packager', () => {
    beforeEach(() => {
      packager['registeredPackagers'] = {
        npm: NPM,
        yarn: Yarn,
      };
    });

    it('npm found', () => {
      expect(packager('npm')).toBe(NPM);
    });

    it('yarn found', () => {
      expect(packager('yarn')).toBe(Yarn);
    });

    it('unknown packager', () => {
      expect(packager('unknown')).toBeUndefined();
    });
  });
});
