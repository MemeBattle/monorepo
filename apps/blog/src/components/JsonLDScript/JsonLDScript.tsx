import type { WithContext, Graph, Thing } from 'schema-dts'
interface JsonLDScriptProps<T extends Thing> {
  jsonLD: WithContext<T> | Graph
}
export function JsonLDScript<T extends Thing>({ jsonLD }: JsonLDScriptProps<T>) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLD) }} />
}
