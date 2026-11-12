# @build-a-bot/sdk

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
});

// The bot works on URLs similar to your example.
const result = await bot.extract({
  urls: ['https://pokemondb.net/pokedex/pikachu'],
});

console.log(result.items);
```
