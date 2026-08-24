export const slugify = (text: string): string => {
  if (!text) return '';
  
  const trChars: { [key: string]: string } = {
    'İ': 'i', 'I': 'i', 'ı': 'i', 'Ş': 's', 'ş': 's', 
    'Ğ': 'g', 'ğ': 'g', 'Ü': 'u', 'ü': 'u', 
    'Ö': 'o', 'ö': 'o', 'Ç': 'c', 'ç': 'c'
  };
  
  return text
    .toString()
    .trim()
    .replace(/[İIıŞşĞğÜüÖöÇç]/g, (match) => trChars[match] || match)
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-');
};