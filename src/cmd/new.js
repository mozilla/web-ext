/* @flow */
import {fs} from 'mz';

const manifest = {
  background: {
    scripts: [],
    page: '',
  },
  browser_action: {
    default_icon: {
      '19': 'button/geo-19.png',
      '38': 'button/geo-38.png',
    },
    default_title: '',
  },
  default_locale: 'en',
  description: '',
  icons: {
    '48': 'icon.png',
    '96': 'icon@2x.png',
  },
  manifest_version: 2,
  name: '',
  page_action: {
    default_icon: {
      '19': 'button/geo-19.png',
      '38': 'button/geo-38.png',
    },
    default_title: '',
  },
  permissions: [],
  version: 0.1,
};

export default async function newCommand(): Promise<void> {
  const path = process.cwd();
  const title = path.match(/[A-z0-9_-]+$/);
  if (Array.isArray(title)) {
    manifest.name = title[0];
    manifest.page_action.default_title = title[0];
    manifest.browser_action.default_title = title[0];
    var json = JSON.stringify(manifest, null, 2);
    try {
      await fs.writeFile('manifest.json', json, 'utf8');
    } catch (error) {
      throw error;
    }
  }
}
