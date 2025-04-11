import { FromToElement, SankeyControllerDatasetOptions, SankeyDataPoint, SankeyNode } from 'chart.js'
import { AnyObject } from 'types/index.esm'

import { validateSizeValue } from './helpers'

const flowSort = (a: FromToElement, b: FromToElement) => {
  // In case the flows are equal, keep original order
  if (b.flow === a.flow) return a.index - b.index

  return b.flow - a.flow
}

const setSizes = (nodes: Map<string, SankeyNode>, size: SankeyControllerDatasetOptions['size']) => {
  const sizeMethod = validateSizeValue(size)

  for (const node of nodes.values()) {
    node.from.sort(flowSort)
    node.to.sort(flowSort)
    // Fallbacks with || are for zero values and min method to avoid zero size.
    node.size = Math[sizeMethod](node.in || node.out, node.out || node.in)
  }
}

export const getParsedData = (data: AnyObject[], parsing: SankeyControllerDatasetOptions['parsing']) => {
  const { from: fromKey = 'from', to: toKey = 'to', flow: flowKey = 'flow', color: colorKey = 'color' } = parsing

  return data.map(({ [fromKey]: from, [toKey]: to, [flowKey]: flow, [colorKey]: color }) => ({ from, to, flow, color }) as SankeyDataPoint)
}

export function buildNodesFromData(
  data: SankeyDataPoint[],
  { size, nodeConfig }: Pick<SankeyControllerDatasetOptions, 'size' | 'nodeConfig'>
): Map<string, SankeyNode> {
  const nodes = new Map<string, SankeyNode>()
  for (let i = 0; i < data.length; i++) {
    const { from, to, flow } = data[i]

    const fromNode: SankeyNode = nodes.get(from) ?? {
      key: from,
      in: 0,
      out: 0,
      size: 0,
      from: [],
      to: [],
    }

    const toNode: SankeyNode = (from === to ? fromNode : nodes.get(to)) ?? {
      key: to,
      in: 0,
      out: 0,
      size: 0,
      from: [],
      to: [],
    }

    fromNode.out += flow
    fromNode.to.push({ key: to, flow: flow, index: i, node: toNode, addY: 0 })
    if (fromNode.to.length === 1) {
      nodes.set(from, fromNode)
    }

    toNode.in += flow
    toNode.from.push({ key: from, flow: flow, index: i, node: fromNode, addY: 0 })
    if (toNode.from.length === 1) {
      nodes.set(to, toNode)
    }
  }

  setSizes(nodes, size)

  // nodeConfig
  const sizeMethod = validateSizeValue(size)
  for (const node of nodes.values()) {
    if (node.key in nodeConfig) {
      const nc = nodeConfig[node.key]
      // priority
      if (nc.priority) {
        node.priority = nc.priority
      }
      // column
      if (nc.column) {
        node.column = true
        node.x = nc.column
      }
      // label
      if (nc.label) {
        node.label = nc.label
      }
      // color
      if (nc.color) {
        node.color = nc.color
      }
    }
  }

  return nodes
}
