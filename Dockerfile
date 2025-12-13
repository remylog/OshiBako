FROM node:18-alpine

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .

# データ保存用ディレクトリ
RUN mkdir -p data

CMD ["npm", "start"]