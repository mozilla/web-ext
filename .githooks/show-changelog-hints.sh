#!/bin/bash
# This shows some hints after one of the git commit hooks for checking
# changelog messages fails.
#
# Because commits are hard to remove (unless you are a pro at interactive
# rebasing), these commit hook checks should make it easier for new
# contributors.
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
