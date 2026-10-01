import type { Config } from 'prettier';

import base from './prettier.json' with { type: 'json' };

// Set `tailwindStylesheet` in the consuming project.
const config: Config = {
  ...(base as Config),
  plugins: ['prettier-plugin-tailwindcss'],
  tailwindFunctions: ['cn', 'cva'],
};

export default config;
