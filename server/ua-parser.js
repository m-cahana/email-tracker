function parseEmailClient(ua) {
  if (!ua) return 'Unknown';

  if (ua.includes('GoogleImageProxy')) return 'Gmail';
  if (ua.includes('Outlook')) return 'Outlook';
  if (ua.includes('Thunderbird')) return 'Thunderbird';
  if (ua.includes('YahooMailProxy')) return 'Yahoo Mail';
  if (ua.includes('iPhone') || ua.includes('iPad')) return 'Apple Mail (iOS)';
  if (ua.includes('AppleMail') || ua.includes('Apple Mail')) return 'Apple Mail';

  return 'Unknown';
}

module.exports = { parseEmailClient };
