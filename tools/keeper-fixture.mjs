// Usage: node tools/keeper-fixture.mjs ../osr_keeper/test/fixtures/sl-pack.json
// Writes osr_keeper's test/fixtures/sl-pack.json: a small Silent Legions content pack in the
// shape of the Silent Legions Foundry VTT importer (module/import/keeper-pack.mjs).
// Every text is a made-up placeholder, not book text.
import fs from "fs";
import { toKeeperPack } from "../module/import/keeper-pack.mjs";
const w = (name, damage, extra = {}) => ({ name, damage, slaughter: "1d6", attributes: ["str", "dex"], range: "", magazine: 0, cost: 10, description: "Test weapon.", ...extra });
const c = (name, o) => ({ name, description: `Test creature: ${name}.`, move: "30'", morale: 8, skill: 1, madness: "None", special: "", slaughter: "1d6", mundaneImmune: false, ...o });
const data = {
  meta: { parserVersion: 1, createdAt: "2026-01-01T00:00:00.000Z" },
  disciplineRules: ["Test rules for disciplines."],
  spells: [{ name: "Whispers of the Scribe", level: 1, page: 40, description: ["Test spell."] },
    { name: "The Black Lamp", level: 3, page: 44, description: ["Test spell."] }],
  disciplines: [{ name: "Telepathy", page: 50, description: ["Test discipline."], levels: [{ level: 1, description: "Test level." }] }],
  weapons: [w("Knife", "1d4"), w("Club", "1d4"), w("Revolver", "1d8", { range: "30/100", magazine: 6 }),
    w("Semi-auto Pistol", "1d6", { range: "30/100", magazine: 15 }), w("Shotgun, Pump", "3d4", { range: "10/30", magazine: 5 })],
  creatures: [
    c("Zombie", { ac: 7, hd: "2", hdValue: 2, morale: 12, skill: 0, madness: "1d6", special: "Undead", save: 14, attacks: [{ name: "rend", bonus: 1, count: 1, damage: "1d6" }] }),
    c("Ghoul", { ac: 7, hd: "3", hdValue: 3, madness: "None / 1d6", special: "Undead", save: 14, attacks: [{ name: "claw", bonus: 3, count: 2, damage: "1d4" }] }),
    c("Vampire", { ac: 6, mundaneImmune: true, hd: "8", hdValue: 8, morale: 10, skill: 3, madness: "None / 1d4", special: "Undead", save: 12, attacks: [{ name: "strike", bonus: 8, count: 2, damage: "1d6+2" }] }),
    c("Ordinary", { ac: 9, hd: "1d4 hp", hdValue: 0.5, save: 15, attacks: [{ name: "wpn", bonus: 0, count: 1, damage: "wpn" }] }),
    c("Outer Entity (Strong)", { ac: 2, hd: "12", hdValue: 12, save: 9, attacks: [{ name: "touch", bonus: 12, count: 1, damage: "2d8" }] })
  ]
};
const pack = toKeeperPack(data);
pack.pack.name = "Silent Legions (test fixture)";
pack.tables = [
  { name: "Test: Omen", tag: "Test Tables", system: "sl", source: "# Test table\n1d4\n1: A cold wind\n2: A dead bird\n3-4: Nothing\n" },
  { name: "Test: Place", tag: "Test Tables", system: "sl", source: "1d2\n1: A cellar\n2: A church\n" },
  { name: "Test Generator", tag: "Generators", system: "sl", source: "# Rolls on each\n1d1\n1: Omen: [Test: Omen]; Place: [Test: Place]\n" }
];
fs.writeFileSync(process.argv[2], JSON.stringify(pack, null, 1) + "\n");
