export const normalizeLotteryNumber = (value: string): string => {
  if (!value) return value;
  const digits = value.replace(/\D/g, '');
  if (!digits) return value.trim();
  return digits.padStart(3, '0');
};
