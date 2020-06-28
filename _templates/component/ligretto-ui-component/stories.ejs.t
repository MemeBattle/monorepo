---
to: packages/ligretto-ui/src/<%= h.changeCase.pascal(name) %>/<%= h.changeCase.pascal(name) %>.stories.tsx
---
import React from 'react'
import { <%= h.changeCase.pascal(name) %> } from './<%= h.changeCase.pascal(name) %>'

export default {
  title: '<%= h.changeCase.pascal(name) %>',
}

export const DefaultView = () => <<%= h.changeCase.pascal(name) %> />
