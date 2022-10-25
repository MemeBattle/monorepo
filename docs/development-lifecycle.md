# Development life cycle

This page documents the development process of MemeBattle team.

## 1. Get the task

Check your [project Board](https://github.com/MemeBattle/monorepo/projects?query=is%3Aopen) and pick the available issue from the top of `TODO` column.

If you do not have any available work, please ask project TeamLead.

## 2. Bootstrap the work environment

1. Assign the issue on yourself and move it to In Development column.
2. Get the latest changes:

```sh
git switch master
git pull --rebase
```

3. Create a new branch from `master`:

```sh
git switch -c feature/<github-issue-id>-<feature-name>
```

## 3. Do the Job

1. Read the task description and clarify all the details
3. Move the issue to `In Progress` column
2. Write the code ⌨️
3. Review your work:

- Make sure all tests are pass
- Make sure linter has no errors or warnings
- Make sure the application log does not have any errors/warnings
- Make sure your code is following our [Conventions](./conventions.md) to reduce the number of review notes

4. Commit & push all changes:

```sh
git add .
git commit -m "[#<github issue id>] <clear and short description of the work>"
```

Pay attention to `[]` around `#<github issue id>` at the beginning of the commit message.

## 4. Submit to Review

1. Create a pull request on GitHub
2. Send pull request link to the telegram group and ask for review
3. Move the issue to `In Code Review` column

## 5. Merge to master

## 6. Wait for result

## 7. Keep your feature branch up-to-date

There can be cases when your merge request shows that there are merge conflicts.

It could happen if someone has merged their request to **master** branch and changes were made somewhere around your code.

In this case, you need to make a rebase of your feature branch from **master** branch.

```sh
git pull origin master --rebase
```

## Additional

### Board Rules

The board is the only source of information about the work. It should be clear from both management and development sides. The board should be updated regularly.

No issue — no work. Each piece of work should be created as an issue on the Github if it is required more than an hour of effort, even just an investigation.

Issue release flow is from left to right. When the work is done simply move the card to to the right.

Priorities works from top to bottom.

Always assign an issue to a person who is working on it at the moment.
