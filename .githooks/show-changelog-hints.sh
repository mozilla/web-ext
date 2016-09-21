#!/bin/bash
echo
echo "-------------------------------------------------------------------"
echo "The above output indicates a problem with one or more of your "
echo "commit messages."
echo
echo "See:"
echo "https://github.com/mozilla/web-ext/blob/master/CONTRIBUTING.md#writing-commit-messages"
echo
echo "Some ways to recover:"
echo "- git commit -n --amend : fix the last commit message"
echo "- git rebase --interactive HEAD~10 : fix any of the last 10 commits"
echo "-------------------------------------------------------------------"
echo
