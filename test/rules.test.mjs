/**
 * Rules numbers in module/config.mjs (no Foundry, no PDF).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { SL } from "../module/config.mjs";

test("class bonus skills are skills of the system and class skills of their class", () => {
  for (const [key, c] of Object.entries(SL.classes)) {
    assert.equal(c.bonusSkills.length, 2, key);
    for (const name of c.bonusSkills.flat()) {
      assert.ok(name in SL.skills, `${key}: ${name} is not a skill`);
      assert.ok(c.skills.includes(name), `${key}: ${name} is not a class skill`);
    }
    for (const name of c.skills) assert.ok(name in SL.skills, `${key}: class skill ${name} is not a skill`);
  }
});

test("skill point costs and limits follow the book table", () => {
  // Skill level: [minimum character level, class skill cost, other skill cost]
  const table = { 0: [1, 1, 2], 1: [1, 2, 3], 2: [3, 3, 4], 3: [6, 4, 5], 4: [9, 5, 6] };
  for (const [level, [minLevel, classCost, otherCost]] of Object.entries(table)) {
    const l = Number(level);
    assert.equal(SL.skillCost(l, true), classCost);
    assert.equal(SL.skillCost(l, false), otherCost);
    assert.ok(SL.maxSkillLevel(minLevel) >= l, `level ${l} at character level ${minLevel}`);
    if (minLevel > 1) assert.ok(SL.maxSkillLevel(minLevel - 1) < l, `level ${l} before character level ${minLevel}`);
  }
});

test("the optional attribute array allows no more 14s than 7s", () => {
  assert.ok(SL.validArray({ str: 14, int: 11, wis: 7, dex: 11, con: 11, cha: 11 }));
  assert.ok(SL.validArray({ str: 14, int: 14, wis: 7, dex: 7, con: 11, cha: 11 }));
  assert.ok(!SL.validArray({ str: 14, int: 14, wis: 7, dex: 11, con: 11, cha: 11 }));
  assert.ok(!SL.validArray({ str: 15, int: 11, wis: 7, dex: 11, con: 11, cha: 11 }));
});

test("background skill text: free picks and book spellings", () => {
  assert.equal(SL.anySkillPicks("Any One Skill"), 1);
  assert.equal(SL.anySkillPicks("Any Two Skills"), 2);
  assert.equal(SL.anySkillPicks("Any Three Skills"), 3);
  assert.equal(SL.anySkillPicks("Combat/Any"), 0);
  assert.equal(SL.anySkillPicks("History"), 0);
  assert.equal(SL.skillName("Persuasion"), "Persuade");
  assert.equal(SL.skillName("Artist"), "Art");
  assert.equal(SL.skillName("Culture/Home"), "Culture/Home");
});

test("discipline learning and mastery costs", () => {
  assert.equal(SL.discipline.learnPoints, 1);
  assert.equal(SL.discipline.learnMadness, 5);
  // Full mastery of levels 0 to 4: 1 Expertise and 30 Madness (35 with the cost of learning).
  const levels = [0, 1, 2, 3, 4];
  assert.equal(levels.reduce((n, l) => n + SL.discipline.masterMadness(l), 0) + SL.discipline.learnMadness, 35);
  assert.equal(levels.reduce((n, l) => n + SL.discipline.masterExpertise(l), 0), 1);
});
