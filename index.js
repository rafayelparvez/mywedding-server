import express from 'express';


const app = express();
const port = process.env.PORT || 8000;

app.get('/', (req, res) => {
  res.send('Server is running fine');
});

app.listen(port, () => {
  console.log(`My Wedding running on port ${port}`);
});