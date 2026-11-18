# Naming convention

## React components

React component should be named in PascalCase notation

```jsx
const ComponentName = () => ...
```

### File naming

File with react component should have a same name as component

**Good**

```tsx
// file name: ComponentName.tsx

const ComponentName = () => ...
```

**Bad**

```tsx
// file name: otherName.tsx

const ComponentName = () => ...
```

### Directory with component files

Directory with component files should have a same name like both component and file

**Good**

```
ComponentName
-- index.ts
-- ComponentName.tsx
```

**Bad**

```
component-name
-- index.ts
-- ComponentName.tsx
```

### Stories file naming

Component stories file should be placed in one directory with component and have a same name with postfix `.stories.tsx`

**Example**

```
ComponentName
-- index.ts
-- ComponentName.tsx
-- ComponentName.stories.tsx
```

### Components connected to the store

A component that reads the store is named for what it shows, like any other component, with no `Container` postfix.
Existing `*Container` components keep their names until a change reworks them.
