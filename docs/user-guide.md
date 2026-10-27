# User guide

How to play Silent Legions with this system in Foundry VTT v13. For the install and the PDF
import, see the [README](../README.md).

The system has the rules mechanics and the skill names. It has no book text. Import your PDF to
get backgrounds, class abilities, spells, disciplines, equipment, creatures, and tables.

## Before you start (GM)

1. Create a world with the "Silent Legions" system.
2. Open the world as a GM. The system creates the compendium **SL: Skills** with the 26 skills
   (name and attribute only).
3. Optional: import your PDF (Compendium sidebar → **Import from PDF**). The import fills the
   other compendiums and replaces **SL: Skills** with the skills and their descriptions.

The creation wizard uses two imported compendiums when they exist:

| Compendium | What the wizard does with it |
|---|---|
| SL: Backgrounds | Lists the 40 backgrounds and their skills. **Roll background** picks one at random. |
| SL: Class Abilities | Adds the class's level-1 ability to the character. |

Without the import, type the background name and its skills, and add the class ability by hand.

## Create a character

1. In the Actors sidebar, create an actor of type **Character**. The sheet lists all 26 skills at
   level -1 (untrained).
2. Click **Create character** in the sheet header. The button shows while the character has no
   class.
3. Fill in the five steps of the wizard:
   1. **Attributes.** Select **Roll 3d6 in order** and click **Roll attributes**, or type the
      scores of your own dice. The chat shows the roll. If the modifiers add up to less than 0,
      the wizard says that the GM may allow a reroll. To use the optional rule, select
      **Place 14, 11, or 7**. The wizard checks that there are no more 14s than 7s.
   2. **Background.** Select a background or click **Roll background**. For a custom background,
      type its name and skills, for example `Culture/Home, History, Any One Skill`.
   3. **Class.** Select the class. Optionally raise one prime attribute to 14 (only when the
      score is lower).
   4. **Wealth.** Average (no change), Struggling (one more skill pick), or Affluent (start with
      10 Madness).
   5. **Skills.** The wizard shows one row per skill pick: the background skills, its
      "Any … Skills" picks, the two class bonus skills, any one class skill, any one skill, and
      the Struggling pick. Select the free picks. Type a specialty for Art, Combat, Culture,
      Profession, and Vehicle (for example `Combat` + `Projectile`).
4. Click **Create character**.

The wizard then:

- sets the attributes, background, wealth, and level 1 in the class;
- raises each picked skill: untrained → level-0, level-0 → level-1;
- rolls hit points: the class hit die + the Con modifier, at least 1;
- sets Expertise to 2, Madness to 0 (10 if Affluent), and skill points to 0;
- adds the background item and the level-1 class ability, if the compendiums exist;
- posts a summary card in the chat.

A new character's skills start at level-1 or lower. If a pick would make a skill level-2, the
wizard shows a warning and asks for another skill.

### Bonus skills without the wizard

For a character made by hand, set the class level on the **Main** tab. Then click
**Bonus skills** on the **Skills** tab. The dialog asks for the two class bonus skills, any one
class skill, and any one skill, with the same level-1 limit.

## The Skills tab

- The skills show in columns. A star marks a class skill. Untrained skills (level -1) are gray.
- The filter buttons show **All** skills, only **Trained** skills, or only **Class skills**.
- Click a skill name to roll 2d6 + skill + attribute modifier. An untrained skill rolls at -1.
  Shift-click skips the dialog.
- The **+** button spends skill points to raise the skill one level:

  | New level | Class skill | Other skill | Lowest character level |
  |---|---|---|---|
  | 0 | 1 | 2 | 1 |
  | 1 | 2 | 3 | 1 |
  | 2 | 3 | 4 | 3 |
  | 3 | 4 | 5 | 6 |
  | 4 | 5 | 6 | 9 |

  The button refuses when the character has too few skill points, or when the new level is above
  the maximum skill level. Each purchase posts a chat card.
- On an untrained specialized skill (Art, Combat, Culture, Profession, Vehicle), the **+** button
  asks for the specialty and adds a new skill, for example `Combat/Projectile`. The untrained
  row stays, so you can add more specialties.
- **Add** (under the list) adds a skill at level-0 for free. Use it for GM awards and fixes.
- You can type the level of a skill directly. -1 means untrained.

## Level up

Click **Level up** in the sheet header and select the class. The system:

- rerolls the whole hit dice pool (+ Con modifier per level) and keeps the higher total;
- removes 10 Madness, adds 1 Expertise, and adds 4 skill points.

A level in a new class needs the first two bonus skills of that class at level-0 or better (for
a Scholar: Research, and History or Science). If the character does not have them, the system
asks whether to level up anyway.

## Sorcery

### Spells

Drag a spell from a compendium onto the character sheet. The system asks:

- **Learn spell**: needs Occult at level-0 or better. Enter the teacher's Occult level (0 for a
  book). The system rolls Int/Occult + teacher against 6 + spell level. Any attempt adds
  1 Madness. A success adds Madness equal to the spell level and adds the spell to the sheet.
- **Already known**: adds the spell without a roll.

Click a spell on the **Sorcery** tab to cast it: pay 1 Expertise or Madness equal to the spell
level. A spell above the caster's Occult level also needs an Int/Occult check.

### Disciplines

Drag a discipline onto the character sheet. The system asks:

- **Learn**: costs 1 skill point and 5 Madness. Skill points can go below 0. This is the book's
  "spend ahead": the next level's skill points pay the debt.
- **Innate (free)**: adds the discipline at level-0 with no cost. Use it at character creation
  if the GM allows an innate discipline.

On the **Sorcery** tab, each discipline has two buttons:

- **+** raises the discipline one level at the cost of a class skill.
- The medal button masters the next level. Level-0 costs 1 Expertise for good (the sheet raises
  "Expertise lost") and 10 Madness. Each later level costs 5 Madness. A mastered level costs
  nothing to use.

Click a discipline name to use it. A mastered level is free. A higher level costs 1 Expertise or
Madness equal to the discipline level + 1.

## Combat

- **Initiative**: 1d8 + Dex modifier for characters, 1d8 for NPCs.
- **Attack**: click a weapon on the **Equipment** tab. Target a token first to use its AC. A hit
  rolls the damage and the Slaughter die. **Apply damage** in the chat card lowers the HP of the
  selected or targeted tokens.
- **0 HP**: a character gets the "Mortally wounded" status. An NPC gets the "Dead" status (the
  combat tracker marks it as defeated). Healing above 0 removes the status.
- Toughs can reroll a missed attack for 1 Expertise. Any class can reroll a failed class skill
  check for 1 Expertise.

## Madness, rest, and macros

- **Madness** (sheet header): pick an event from the book's Madness table (after the import), or
  type a formula.
- **Rest**: + HP equal to the character level, + 1 Expertise.
- Drag a skill, weapon, spell, discipline, or class ability from the sheet to the hotbar to make
  a roll macro.
