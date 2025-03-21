FROM node:22-alpine

WORKDIR /app

COPY package*.json yarn.lock ./

RUN yarn install

COPY . .

RUN yarn prisma generate

RUN yarn build

CMD ["yarn", "start:prod"]