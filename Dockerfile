FROM node:18-alpine

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .

# データディレクトリの作成（権限エラー防止）
RUN mkdir -p data

EXPOSE 3000

CMD ["npm", "start"]