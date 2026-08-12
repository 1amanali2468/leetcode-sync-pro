const fs = require('fs');
const markdown = \# 123. Two Sum
| Platform | Difficulty | Topics | Pattern |
| :--- | :--- | :--- | :--- |
| [LeetCode](https://leetcode.com/problems/two-sum) | ![Easy](https://img.shields.io/badge/Difficulty-Easy-16a34a?style=flat-square) | \Array\, \Hash Table\ | \None\ |
---
## Problem Description
Blah blah
## Approaches
### optimal
<!-- leetsync:approach=optimal -->
| Metric | Value |
| :--- | :--- |
| ?? Time Complexity | \O(N)\ |
| ??? Space Complexity | \O(N)\ |
| ? Time Spent | \5 mins\ |
| ?? Topic Tag | \Array\ |
| ?? Pattern Used | \None\ |
| ?? Collection | \Blind 75\ |
#### ?? Notes
> This is my note
> I solved this very well.
\;

    const APPROACHES_HEADER = '## Approaches';
    if (!markdown.includes(APPROACHES_HEADER)) { console.log('no approaches'); return; }
    
    const splitIdx = markdown.indexOf(APPROACHES_HEADER);
    const approachesRaw = markdown.slice(splitIdx + APPROACHES_HEADER.length).trim();
    const blocks = approachesRaw.split('### ').slice(1);
    
    blocks.forEach(block => {
      const lines = block.split('\n');
      const approachLabel = lines[0].trim().toLowerCase();
      let notes = '';
      const notesMatch = block.match(/####?\s*.*?Notes([\s\S]*)/i);
      if (notesMatch) {
        notes = notesMatch[1].trim();
        notes = notes.replace(/^>\s*/gm, '');
        if (notes === '_No notes added._') notes = '';
      }
      console.log('Parsed approach:', approachLabel);
      console.log('Parsed notes:', JSON.stringify(notes));
    });

