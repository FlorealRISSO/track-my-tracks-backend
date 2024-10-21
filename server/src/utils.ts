import bcrypt from 'bcrypt';

export const generateRandomString = (length: number): string => {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length }, () => possible.charAt(Math.floor(Math.random() * possible.length))).join('');
};

export const filterNonAlphanumeric = (str: string): string => str.replace(/[^a-zA-Z0-9]/g, '');

export function msToHM(ms: number): string {
  const totalMinutes = Math.floor(ms / 1000 / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  // Return the formatted string "h m"
  return `${hours}h ${minutes}m`;
}

export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 10; // Adjust this as needed
  const hash = await bcrypt.hash(password, saltRounds);
  return hash;
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const isMatch = await bcrypt.compare(password, hash);
  return isMatch;
}

export const verifyDate = async (date: string) => {
    // format yyyy-mm-dd
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!date.match(dateRegex)) {
        return false;
    }
    return true;
}
