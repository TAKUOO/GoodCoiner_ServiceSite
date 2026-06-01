export const getAppDownloadUrl = (
  env?: { PUBLIC_APP_DOWNLOAD_URL?: string },
): string => {
  const url = env?.PUBLIC_APP_DOWNLOAD_URL?.trim();
  return url || "/#download";
};
