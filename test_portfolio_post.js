(async () => {
  try {
    const payload = {
      weeklyAmount: 500,
      fxFeePercent: 1.5,
      targets: [
        { symbol: 'AAPL', targetWeight: 50, currency: 'USD' },
        { symbol: 'TD.TO', targetWeight: 50, currency: 'CAD' },
      ],
    };

    const response = await fetch(
      'http://localhost:3000/api/settings/portfolio',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    );

    const text = await response.text();
    console.log(`Status: ${response.status}`);
    console.log(`Body: ${text}`);
  } catch (e) {
    console.error(e);
  }
})();
