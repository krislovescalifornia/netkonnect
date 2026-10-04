import { win32 } from 'node:path';

export const companionStartupName = 'netKonnect Companion';
// Electron's native launchItems argument list omits command-line switches.
// A positional mode lets us verify the complete startup command through that API.
export const companionStartupArgs = ['collector'];
const plainPath = value => win32.normalize(String(value || '').replace(/^"(.*)"$/, '$1')).toLowerCase();

export function companionLoginOptions(executable) {
  return { path:executable, args:[...companionStartupArgs], name:companionStartupName };
}

export function readCompanionStartup(app, executable) {
  // Electron 44.5.1 parses this lookup as a command line. Quoting keeps
  // Program Files intact; openAtLogin checks the app ID, not our named entry.
  const login = app.getLoginItemSettings({ path:`"${executable}"`, args:[...companionStartupArgs] });
  const item = login.launchItems?.find(item => item.name === companionStartupName && item.scope === 'user'
    && plainPath(item.path) === plainPath(executable) && Array.isArray(item.args)
    && item.args.length === companionStartupArgs.length && item.args.every((arg,index)=>arg === companionStartupArgs[index]));
  return { ready:item?.enabled === true, registered:!!item, enabled:item?.enabled === true,
    name:companionStartupName, path:item?.path || executable, args:item?.args || [...companionStartupArgs] };
}

export function setCompanionStartup(app, executable, enabled) {
  app.setLoginItemSettings({ ...companionLoginOptions(executable), openAtLogin:enabled, enabled });
  const status = readCompanionStartup(app, executable);
  if (enabled && !status.ready) throw new Error('Automatic collection at sign-in could not be enabled. Check netKonnect Companion in Windows Startup Apps, then retry setup.');
  if (!enabled && status.registered) throw new Error('Windows did not remove the netKonnect Companion startup entry. Retry this setting.');
  return status;
}
