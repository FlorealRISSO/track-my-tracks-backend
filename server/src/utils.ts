const generateRandomString = (length: number): string => {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length }, () => possible.charAt(Math.floor(Math.random() * possible.length))).join('');
};

const generateRandomKey = (login: string, length: number): string => {
  const randomString = generateRandomString(length);
  return `${login}${randomString}`;
}

const filterNonAlphanumeric = (str: string): string => str.replace(/[^a-zA-Z0-9]/g, '');

function msToHM(ms: number): string {
  const totalMinutes = Math.floor(ms / 1000 / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  // Return the formatted string "h m"
  return `${hours}h ${minutes}m`;
}

export { generateRandomString, filterNonAlphanumeric, msToHM, generateRandomKey };
