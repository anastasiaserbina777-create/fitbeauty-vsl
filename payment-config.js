const getAmount = () => {
  const value = String(process.env.WFP_AMOUNT || '1290').trim();
  return /^\d+(?:\.\d{1,2})?$/.test(value) && Number(value) > 0 ? value : '1290';
};

module.exports = function paymentConfig(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ message: 'Method not allowed' });
  }

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ amount: getAmount() });
};
