// flow-typed signatures for 'firefox-profile' module.

declare module "firefox-profile" {
  declare type ProfileOptions = {
    destinationDirectory: string,
  }

  declare type ProfileCallback = 
    (err: ?Error, profile: FirefoxProfile) => void;

  declare class Finder {
    constructor(baseDir: ?string): Finder,
    readProfiles(cb: Function): void,
    getPath(name: string, cb: (err: ?Error, profilePath: string) => void): void,

    profiles: Array<{ [key:string]: string }>, 

    static locateUserDirectory(): string,
  }

  declare class FirefoxProfile {
    constructor(opts: ?ProfileOptions): FirefoxProfile,

    extensionsDir: string,
    profileDir: string,
    userPrefs: string,
    defaultPreferences: { [key: string]: any },

    path(): string,
    setPreference(pref: string, value: any): void,
    updatePreferences(): void,
    
    static copy({profileDirectory: string}, cb: ProfileCallback): void,
    static copyFromUserProfile({name: string}, cb: ProfileCallback): void,
    static Finder: Class<Finder>,
  }

  declare module.exports: Class<FirefoxProfile>;
}
