const express = require('express');
const axios = require('axios');
const app = express();
const PORT = 5001;

app.use(express.json());

app.get('/api/define/:word', async (req, res) => {
  const { word } = req.params;
  try {
    const response = await axios.get(`https://api.dictionaryapi.dev/api/v2/entries/en/${word}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: 'Definition not found.' });
  }
});

app.listen(PORT, () => {
  console.log(`Proxy server running on port ${PORT}`);
});
