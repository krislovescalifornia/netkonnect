import { resolve } from 'node:path';

export const companionProtocol = 1;
export function assertCompanionIdentity(data, root, version) {
  const identity = data?.service?.identity;
  if (!identity || typeof identity.root !== 'string' || identity.protocol !== companionProtocol || identity.version !== version
      || resolve(identity.root).toLowerCase() !== resolve(root).toLowerCase()) {
    throw new Error('An older or different copy of the netKonnect companion is running. Quit netKonnect companions from the Windows notification area, then reopen this installed app. Your saved history is kept.');
  }
  return data;
}
