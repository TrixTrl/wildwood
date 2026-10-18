export const DEVELOPER_IDENTITY = "c200a2bd4fd89d5cc59811729734b7f92d6bf328eda8fc64963fa5f7760dcb13";
export function isDeveloperIdentity(identity?: string | null) {
  return identity?.replace(/^0x/i, "").toLowerCase() === DEVELOPER_IDENTITY;
}

export const HALLOWED_IDENTITY = "c200d854afc689de2bd5387eb8c4efebb4ed6f48ef18578d354b81a12a918ac9";
export function isAlteredDeveloperIdentity(identity?: string | null) {
  return identity?.replace(/^0x/i, "").toLowerCase() === HALLOWED_IDENTITY;
}
