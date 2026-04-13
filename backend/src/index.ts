import express from 'express';

const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('FrameBox Backend is running!');
});

app.listen(port, () => {
  console.log(`✅ FrameBox Backend rodando na porta ${port}`);
});
