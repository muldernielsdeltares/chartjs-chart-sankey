import {
  ChartMeta,
  DatasetController,
  FromToElement,
  SankeyControllerDatasetOptions,
  SankeyNode,
  SankeyParsedData,
} from 'chart.js'
import { toFont, valueOrDefault } from 'chart.js/helpers'

import { AnyObject } from '../types/index.esm'

import { buildNodesFromData, getParsedData } from './lib/core'
import { toTextLines, validateSizeValue } from './lib/helpers'
import { layout } from './lib/layout'
import Flow from './flow'

function getAddY(arr: FromToElement[], key: string, index: number): number {
  for (const item of arr) {
    if (item.key === key && item.index === index) {
      return item.addY
    }
  }
  return 0
}

export default class SankeyController extends DatasetController {
  static readonly id = 'sankey'

  static readonly defaults = {
    dataElementType: 'flow',
    animations: {
      numbers: {
        type: 'number',
        properties: ['x', 'y', 'x2', 'y2', 'height'],
      },
      progress: {
        easing: 'linear',
        duration: (ctx) => (ctx.type === 'data' ? (ctx.parsed._custom.x - ctx.parsed.x) * 200 : undefined),
        delay: (ctx) => (ctx.type === 'data' ? ctx.parsed.x * 500 + ctx.dataIndex * 20 : undefined),
      },
      colors: {
        type: 'color',
        properties: ['colorFrom', 'colorTo'],
      },
    },
    color: 'black',
    borderColor: 'black',
    borderWidth: 1,
    modeX: 'edge',
    nodeWidth: 10,
    nodePadding: 10,
    transitions: {
      hide: {
        animations: {
          colors: {
            type: 'color',
            properties: ['colorFrom', 'colorTo'],
            to: 'transparent',
          },
        },
      },
      show: {
        animations: {
          colors: {
            type: 'color',
            properties: ['colorFrom', 'colorTo'],
            from: 'transparent',
          },
        },
      },
    },
  }

  static readonly overrides = {
    interaction: {
      mode: 'nearest',
      intersect: true,
    },
    datasets: {
      clip: false,
      parsing: { from: 'from', to: 'to', flow: 'flow', color: 'color' },
    },
    plugins: {
      tooltip: {
        displayColors: false,
        callbacks: {
          title() {
            return ''
          },
          label(context) {
            const parsedCustom = context.parsed._custom
            return parsedCustom.from.key + ' → ' + parsedCustom.to.key + ': ' + parsedCustom.flow
          },
        },
      },
      legend: {
        display: false,
      },
    },
    scales: {
      x: {
        type: 'linear',
        bounds: 'data',
        display: false,
        min: 0,
        offset: false,
      },
      y: {
        type: 'linear',
        bounds: 'data',
        display: false,
        min: 0,
        reverse: true,
        offset: false,
      },
    },
    layout: {
      padding: {
        top: 3,
        left: 3,
        right: 13,
        bottom: 3,
      },
    },
  }

  options: SankeyControllerDatasetOptions
  private _nodes: Map<string, SankeyNode>
  private _maxX: number
  private _maxY: number

  override parseObjectData(
    meta: ChartMeta<'sankey', Flow>,
    data: AnyObject[],
    start: number,
    count: number
  ): SankeyParsedData[] {
    const sankeyData = getParsedData(data, this.options.parsing)
    const { xScale, yScale } = meta
    const parsed: SankeyParsedData[] = []
    const nodes = (this._nodes = buildNodesFromData(sankeyData, this.options))

    const { maxX, maxY } = layout(nodes, sankeyData, {
      order: this.options.nodeConfig && Object.values(this.options.nodeConfig).some(n => n.order),
      height: this.chart.canvas.height,
      nodePadding: this.options.nodePadding,
      modeX: this.options.modeX,
    })

    this._maxX = maxX
    this._maxY = maxY

    if (!xScale || !yScale) return []

    for (let i = 0, ilen = sankeyData.length; i < ilen; ++i) {
      const dataPoint = sankeyData[i]
      const from = nodes.get(dataPoint.from)
      const to = nodes.get(dataPoint.to)
      if (!from || !to) continue

      const fromY: number = (from.y ?? 0) + getAddY(from.to, dataPoint.to, i)
      const toY: number = (to.y ?? 0) + getAddY(to.from, dataPoint.from, i)

      parsed.push({
        x: xScale.parse(from.x, i) as number,
        y: yScale.parse(fromY, i) as number,
        _custom: {
          from,
          to,
          x: xScale.parse(to.x, i) as number,
          y: yScale.parse(toY, i) as number,
          height: yScale.parse(dataPoint.flow, i) as number,
          flow: dataPoint.flow,
          color: dataPoint.color,
        },
      })
    }
    return parsed.slice(start, start + count)
  }

  override getMinMax(scale) {
    return {
      min: 0,
      max: scale === this._cachedMeta.xScale ? this._maxX : this._maxY,
    }
  }

  override update(mode) {
    const { data } = this._cachedMeta as ChartMeta<'sankey', Flow>

    this.updateElements(data, 0, data.length, mode)
  }

  override updateElements(
    elems: Flow[],
    start: number,
    count: number,
    mode: 'default' | 'resize' | 'reset' | 'none' | 'hide' | 'show' | 'active'
  ) {
    const { xScale, yScale } = this._cachedMeta
    if (!xScale || !yScale) return

    const firstOpts = this.resolveDataElementOptions(start, mode)
    const sharedOptions = this.getSharedOptions(firstOpts)
    const { borderWidth, nodeWidth = 10 } = this.options
    const borderSpace = borderWidth ? borderWidth / 2 + 0.5 : 0

    for (let i = start; i < start + count; i++) {
      const parsed = this.getParsed(i) as SankeyParsedData
      const custom = parsed._custom
      const y = yScale.getPixelForValue(parsed.y)
      this.updateElement(
        elems[i],
        i,
        {
          x: xScale.getPixelForValue(parsed.x) + nodeWidth + borderSpace,
          y,
          x2: xScale.getPixelForValue(custom.x) - borderSpace,
          y2: yScale.getPixelForValue(custom.y),
          from: custom.from,
          to: custom.to,
          progress: mode === 'reset' ? 0 : 1,
          height: Math.abs(yScale.getPixelForValue(parsed.y + custom.height) - y),
          options: this.resolveDataElementOptions(i, mode),
          color: custom.color,
        },
        mode
      )
    }

    this.updateSharedOptions(sharedOptions, mode, firstOpts)
  }

  private _drawLabels() {
    const ctx = this.chart.ctx
    const options = this.options
    const nodes = this._nodes || new Map()
    const size = validateSizeValue(options.size)
    const borderWidth = options.borderWidth ?? 1
    const nodeWidth = options.nodeWidth ?? 10
    const { xScale, yScale } = this._cachedMeta

    if (!xScale || !yScale) return

    ctx.save()
    const chartArea = this.chart.chartArea
    for (const node of nodes.values()) {
      const x = xScale.getPixelForValue(node.x)
      const y = yScale.getPixelForValue(node.y)

      const max = Math[size](node.in || node.out, node.out || node.in)
      const height = Math.abs(yScale.getPixelForValue(node.y + max) - y)

      let labelText
      if (typeof node.label?.text === 'function') {
        labelText = node.label.text(node)
      } else {
        labelText = node.label?.text ?? node.key
      }
      let textX = x
      ctx.textBaseline = 'middle'

      let position = node.label.position || (x < chartArea.width / 2 ? 'right' : 'left');
      if (position === 'right') {
        ctx.textAlign = 'left'
        textX += nodeWidth + borderWidth + 4
      } else if (position === 'left') {
        ctx.textAlign = 'right'
        textX -= borderWidth + 4
      } else {
        ctx.textAlign = 'center'
        textX += nodeWidth / 2
      }


      this._drawLabel(labelText, y, height, ctx, textX, node.label, position)
    }
    ctx.restore()
  }

  private _drawLabel(labelText: string, y: number, height: number, ctx: CanvasRenderingContext2D, textX: number, label:any, position:string) {
    const font = toFont(this.options.font, this.chart.options.font)
    const lines = toTextLines(labelText)
    const lineCount = lines.length
    const middle = y + height / 2
    const textHeight = font.lineHeight
    const padding = valueOrDefault(this.options.padding, textHeight / 2)

    ctx.font = font.string

    if (lineCount > 1) {
      const top = middle - (textHeight * lineCount) / 2 + padding
      for (let i = 0; i < lineCount; i++) {
        ctx.fillText(lines[i], textX, top + i * textHeight)
      }
    } else {
      if(label.color?.background) {
        const paddingX = textHeight/2
        const width = ctx.measureText(labelText).width + paddingX*2
        ctx.fillStyle = label.color?.background
        let x
        if (position==='left') {
          x = textX-width+paddingX
        } else if(position==='right') {
          x = textX-paddingX
        } else {
          x = textX - width / 2
        }
        ctx.fillRect(x, middle - textHeight / 2 - 2, width, 20)
      }
      ctx.fillStyle = label.color?.text ?? this.options.color ?? 'darkgrey'
      ctx.fillText(labelText, textX, middle)
    }
  }

  private _drawNodes() {
    const ctx = this.chart.ctx
    const nodes = this._nodes || new Map()
    const { borderColor, borderWidth = 0, nodeWidth = 10, size } = this.options
    const sizeMethod = validateSizeValue(size)
    const { xScale, yScale } = this._cachedMeta

    ctx.save()
    if (borderColor && borderWidth) {
      ctx.strokeStyle = borderColor
      ctx.lineWidth = borderWidth
    }

    for (const node of nodes.values()) {
      ctx.fillStyle = node.color ?? '#888'
      const x = xScale!.getPixelForValue(node.x)
      const y = yScale!.getPixelForValue(node.y)

      const max = Math[sizeMethod](node.in || node.out, node.out || node.in)
      const height = Math.abs(yScale!.getPixelForValue(node.y + max) - y)
      if (borderWidth) {
        ctx.strokeRect(x, y, nodeWidth, height)
      }
      ctx.fillRect(x, y, nodeWidth, height)
    }
    ctx.restore()
  }

  /**
   * That's where the drawing process happens
   */
  override draw() {
    const ctx = this.chart.ctx
    const data = (this.getMeta().data as Flow[]) ?? []

    this._drawNodes()

    for (let i = 0, ilen = data.length; i < ilen; ++i) {
      data[i].draw(ctx)
    }

    this._drawLabels()
  }
}
