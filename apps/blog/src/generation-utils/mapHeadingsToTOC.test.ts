import { mapHeadingsToTOC } from './mapHeadingsToTOC'

describe('mapHeadingsToTOC', () => {
  it('Should return empty array for empty headings', () => {
    expect(mapHeadingsToTOC([])).toEqual([])
  })

  it('Should return flat toc for h2 only', () => {
    expect(
      mapHeadingsToTOC([
        {
          value: 'heading 1',
          slug: 'heading-1',
          level: 2,
        },
        {
          value: 'heading 2',
          slug: 'heading-2',
          level: 2,
        },
      ]),
    ).toEqual([
      {
        value: 'heading 1',
        slug: 'heading-1',
        level: 2,
        children: [],
      },
      {
        value: 'heading 2',
        slug: 'heading-2',
        level: 2,
        children: [],
      },
    ])
  })

  it('Should return nested toc for h2 and h3', () => {
    expect(
      mapHeadingsToTOC([
        {
          value: 'heading 1',
          slug: 'heading-1',
          level: 2,
        },
        {
          value: 'heading 2',
          slug: 'heading-2',
          level: 3,
        },
      ]),
    ).toEqual([
      {
        value: 'heading 1',
        slug: 'heading-1',
        level: 2,
        children: [
          {
            value: 'heading 2',
            slug: 'heading-2',
            level: 3,
            children: [],
          },
        ],
      },
    ])
  })

  it('Should return nested toc for h2, h3, h4', () => {
    expect(
      mapHeadingsToTOC([
        {
          value: 'heading 1',
          slug: 'heading-1',
          level: 2,
        },
        {
          value: 'heading 2',
          slug: 'heading-2',
          level: 3,
        },
        {
          value: 'heading 3',
          slug: 'heading-3',
          level: 4,
        },
      ]),
    ).toEqual([
      {
        value: 'heading 1',
        slug: 'heading-1',
        level: 2,
        children: [
          {
            value: 'heading 2',
            slug: 'heading-2',
            level: 3,
            children: [
              {
                value: 'heading 3',
                slug: 'heading-3',
                level: 4,
                children: [],
              },
            ],
          },
        ],
      },
    ])
  })

  it('Should return flat and nested toc', () => {
    expect(
      mapHeadingsToTOC([
        {
          value: 'heading 1',
          slug: 'heading-1',
          level: 2,
        },
        {
          value: 'heading 2',
          slug: 'heading-2',
          level: 3,
        },
        {
          value: 'heading 3',
          slug: 'heading-3',
          level: 3,
        },
      ]),
    ).toEqual([
      {
        value: 'heading 1',
        slug: 'heading-1',
        level: 2,
        children: [
          {
            value: 'heading 2',
            slug: 'heading-2',
            level: 3,
            children: [],
          },
          {
            value: 'heading 3',
            slug: 'heading-3',
            level: 3,
            children: [],
          },
        ],
      },
    ])
  })
})
