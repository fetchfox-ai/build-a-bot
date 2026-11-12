# Build-a-Bot

Build scraper bots that convert any URLs into clean data.

Get an API key at https://bab.fetchfox.ai

## Install

```sh
npm install @build-a-bot/sdk zod
```

## Example

Write your first scraper like this:

```js
import { BuildABot } from '@build-a-bot/sdk';
import { z } from 'zod';

const client = new BuildABot({
  apiKey: 'ffk_your_api_key',
});


// Pick an example URL for the scraper bot.
const url = 'https://pokemondb.net/pokedex/bulbasaur';

// The first build may take a few minutes. After that, Build-A-Bot reuses
// the saved scraper bot.
const bot = await client.data.bots.build({
  name: 'pokemon-pokedex',
  sources: [{ url }],
  itemSchema: z.object({
    name: z.string(),
    number: z.string(),
    hp: z.number(),
    attack: z.number(),
  }),
  fingerprintSchema: z.object({
    number: z.string(),
  }),
});

// The bot works on URLs similar to your example.
const items = await bot.extract({
  urls: ['https://pokemondb.net/pokedex/pikachu'],
});

console.log(items[0]);
// Item {
//   id: 'df042fbd8161425bf75606174c409775da2ab426148ef9526bc3c3c38878b95a',
//   timestamp: 2026-11-12T22:16:00.000Z,
//   fingerprint: { number: '0025' },
//   data: { name: 'Pikachu', number: '0025', hp: 35, attack: 55 },
//   citations: {
//     name: { raw: '<a ...>Pikachu</a>', sourceUrl: 'https://pokemondb.net/pokedex/pikachu' },
//     // Citations for number, hp, and attack follow the same shape.
//   },
// }
```
