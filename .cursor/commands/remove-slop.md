# Remove AI code slop

Check the diff against working state, and remove all AI generated slop introduced in this branch. Do not remove code that wasn't part of the diff.

This includes:
- Extra comments that a human wouldn't add or is inconsistent with the rest of the file
- Extra defensive checks or try/catch blocks that are abnormal for that area of the codebase (especially if called by trusted / validated codepaths)
- Casts to any to get around type issues
- Any other style that is inconsistent with the file

Also review for:
- Duplicated or unnecessary code
- Review changed code with respect to rest of codebase to see if it matches codebase patterns and doesn't introduce redundnacies. If there's repeated logic, refactor and simplify
- WHether the same functionality and UI changes introduced can be done in a simpler way

Aim to always try and remove lines of code.

Report at the end with only a 1-3 sentence summary of what you change