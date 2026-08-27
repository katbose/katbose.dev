#!/usr/bin/env node

const bold = "\u001B[1m";
const cyan = "\u001B[36m";
const reset = "\u001B[0m";

const lines = [
  `${bold}KatBose${reset} · Software Engineer`,
  "",
  `${cyan}Web${reset}       https://katbose.dev`,
  `${cyan}Ask AI${reset}    https://katbose.dev/ask-ai`,
  `${cyan}GitHub${reset}    https://github.com/katbose`,
  `${cyan}LinkedIn${reset}  https://linkedin.com/in/katbose`,
  `${cyan}Email${reset}     im@katbose.dev`,
];

process.stdout.write(`${lines.join("\n")}\n`);
