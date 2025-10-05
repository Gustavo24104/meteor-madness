// backend/src/server.ts

import express from 'express';
import axios from 'axios';
import cors from 'cors';

const app = express();
const PORT = 3001; // Uma porta diferente da sua aplicação frontend


// Habilita o CORS para que seu frontend (ex: rodando na porta 3000)
// possa fazer requisições para este backend (rodando na porta 3001).
app.use(cors());

// Nosso endpoint de proxy
app.get('/api/nasa-sbdb', async (req, res) => {
  // Pega o parâmetro 'sstr' da requisição do frontend
  const searchString = req.query.sstr;

  if (!searchString) {
    return res.status(400).json({ error: "O parâmetro 'sstr' é obrigatório." });
  }

  //ssd-api.jpl.nasa.gov/sbdb.api
  const nasaApiUrl = `https://ssd-api.jpl.nasa.gov/sbdb.api?neo=1&sstr=${searchString}`;
  let apiResponse;

  try {
    console.log(`Fazendo proxy da requisição para: ${nasaApiUrl}`);

    // Faz a requisição para a API da NASA usando axios
    apiResponse = await axios.get(nasaApiUrl);

    // Envia a resposta da NASA de volta para o seu frontend
    res.json(apiResponse.data);
    console.log(JSON.parse(apiResponse.data).spkid);
    //res = new Response(JSON.stringify(apiResponse.data));
    //console.log(JSON.stringify(apiResponse.data));

  } catch (error) {
    if(error.status == 300) {
      res.status(300);
      res.json(error.response.data);
      return;
    }
    // Se der erro, repassa uma mensagem de erro para o frontend
    else res.status(error.status).json({ error: error });
  }
});

app.get('/api/nasa-neo', async (req, res) => {
  // Pega o parâmetro 'sstr' da requisição do frontend
  const spkid = req.query.spkid;
  const api_key = req.query.api_key;

  if (!spkid) {
    return res.status(400).json({ error: "O parâmetro 'spkid' é obrigatório." });
  }

  //ssd-api.jpl.nasa.gov/sbdb.api
// https://api.nasa.gov/neo/rest/v1/neo/2001862?api_key=liMvpY42qNeCxtxbrf7B1oUMM8urB0UdHiHfRMNo
  const nasaApiUrl = `https://api.nasa.gov/neo/rest/v1/neo/${spkid}?api_key=${api_key}`;
  let apiResponse;

  try {
    console.log(`REQUISICAO DO NEO SER TIPO: ${nasaApiUrl}`);

    apiResponse = await axios.get(nasaApiUrl);

    res.json(apiResponse.data);
    console.log(JSON.parse(apiResponse.data).spkid);

  } catch (error) {
    // Se der erro, repassa uma mensagem de erro para o frontend
    res.status(500).json({ error: error });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor proxy rodando em http://localhost:${PORT}`);
});