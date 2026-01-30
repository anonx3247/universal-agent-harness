import * as readline from "readline";

export async function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export async function select<T extends string>(
  question: string,
  choices: readonly T[],
  defaultChoice?: T,
): Promise<T> {
  console.log(`\n${question}`);
  choices.forEach((choice, idx) => {
    const isDefault = choice === defaultChoice;
    console.log(
      `  ${idx + 1}. ${choice}${isDefault ? " (default)" : ""}`,
    );
  });

  const answer = await prompt(
    `\nEnter choice (1-${choices.length})${defaultChoice ? ` [${choices.indexOf(defaultChoice) + 1}]` : ""}: `,
  );

  if (!answer && defaultChoice) {
    return defaultChoice;
  }

  const choiceIdx = parseInt(answer) - 1;
  if (isNaN(choiceIdx) || choiceIdx < 0 || choiceIdx >= choices.length) {
    console.log("Invalid choice, please try again.");
    return select(question, choices, defaultChoice);
  }

  return choices[choiceIdx];
}

export async function confirm(
  question: string,
  defaultValue = false,
): Promise<boolean> {
  const answer = await prompt(
    `${question} (${defaultValue ? "Y/n" : "y/N"}): `,
  );

  if (!answer) {
    return defaultValue;
  }

  const normalized = answer.toLowerCase();
  return normalized === "y" || normalized === "yes";
}

export async function number(
  question: string,
  defaultValue?: number,
  min?: number,
  max?: number,
): Promise<number> {
  const defaultText = defaultValue !== undefined ? ` [${defaultValue}]` : "";
  const rangeText = min !== undefined || max !== undefined
    ? ` (${min !== undefined ? `min: ${min}` : ""}${min !== undefined && max !== undefined ? ", " : ""}${max !== undefined ? `max: ${max}` : ""})`
    : "";

  const answer = await prompt(`${question}${rangeText}${defaultText}: `);

  if (!answer && defaultValue !== undefined) {
    return defaultValue;
  }

  const num = parseFloat(answer);
  if (isNaN(num)) {
    console.log("Invalid number, please try again.");
    return number(question, defaultValue, min, max);
  }

  if (min !== undefined && num < min) {
    console.log(`Number must be at least ${min}, please try again.`);
    return number(question, defaultValue, min, max);
  }

  if (max !== undefined && num > max) {
    console.log(`Number must be at most ${max}, please try again.`);
    return number(question, defaultValue, min, max);
  }

  return num;
}
