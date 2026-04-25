const axios = require('axios');

async function executeTrade(signal) {
  console.log('⚡ EXECUTION START');

  const lot = Number(signal.volume || 0.01);
  const encodedVolume = Math.round(lot * 100000);

  console.log('📊 Lot:', lot);
  console.log('📊 Encoded Volume:', encodedVolume);

  try {
    const response = await axios.post(
      'http://localhost:3000/ctrader/proto/order',
      {
        symbolId: 41,
        side: String(signal.action || '').toUpperCase(),
        volume: encodedVolume,
        label: 'RKL-BOT',
        comment: 'Auto trade from bot'
      },
      {
        headers: {
          'x-api-key': 'maher123'
        }
      }
    );

    console.log('✅ ORDER RESPONSE:', response.data);
  } catch (err) {
    console.error('❌ ERROR:', err.response?.data || err.message);
  }
}

module.exports = { executeTrade };