FROM node:22-alpine

WORKDIR /app

# Use yarn classic (v1) to match yarn.lock format
RUN corepack disable 2>/dev/null; npm install -g yarn@1.22.22

COPY package*.json yarn.lock ./

RUN yarn install --frozen-lockfile

COPY . .

RUN yarn prisma generate

RUN yarn build

CMD ["yarn", "start:prod"]