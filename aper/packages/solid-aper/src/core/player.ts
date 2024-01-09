import { Howl, HowlCallback, HowlErrorCallback } from "howler"
import { Audio } from ".."

type StepEvent = (e: {
  seek: number
  percent: number
  playing: boolean
}) => void

// NOTE: const vs as const
// const 确保 HowlEvents 不能被重新赋值，但是不能确保数组内的元素不能修改。
// as const 将数组转化为一个只读数组，阻止修改内部元素。
const HowlEvents = [
  "load",
  "loaderror",
  "playerror",
  "play",
  "end",
  "pause",
  "stop",
  "mute",
  "volume",
  "rate",
  "seek",
  "fade",
  "unlock",
] as const

type Event = {
  // howl events
  load: () => void
  loaderror: HowlErrorCallback
  playerror: HowlErrorCallback
  play: HowlCallback
  end: HowlCallback
  pause: HowlCallback
  stop: HowlCallback
  mute: HowlCallback
  volume: HowlCallback
  rate: HowlCallback
  seek: HowlCallback
  fade: HowlCallback
  unlock: HowlCallback
  // player events
  step: StepEvent
}

type Events = {
  [K in keyof Event]: {
    callback: Event[K]
    once: boolean
  }[]
}

export interface PlayerOptions {
  audios: Audio[]
  debug?: boolean
}

// NOTE: Player 实现对音乐播放库 howler 的封装
export class Player {
  debug: boolean
  // play 对象是由 Audio + (optional)howl 组合的的新对象
  playlist: (Audio & { howl?: Howl })[]
  options: PlayerOptions
  events: Events = {
    load: [],
    loaderror: [],
    playerror: [],
    play: [],
    end: [],
    pause: [],
    stop: [],
    mute: [],
    volume: [],
    rate: [],
    seek: [],
    fade: [],
    unlock: [],
    step: [],
  }
  interval?: number
  timeout: number = 200
  index: number = 0
  // NOTE: TS 构造函数
  constructor(options: PlayerOptions) {
    this.playlist = options.audios
    this.debug = options.debug ?? false
    this.options = options
  }
  play(index?: number) {
    this.debug && console.log("play", index)
    // NOTE: self 的使用
    // var self = this 是一种常见的JavaScript编程模式，用于保存 this 的引用。
    // 在JavaScript中，this 关键字的值取决于函数的调用方式。在某些情况下（例如在回调函数或者方法内部），this 可能不会指向你期望的对象。
    // 为了避免混淆，开发者经常会在函数的开始部分将 this 保存在一个变量（通常命名为 self、that 或 _this）中，然后在函数的其余部分使用这个变量。
    // 例如，在你提供的代码中，sound.on 的回调函数中的 this 可能不会指向外部函数的 this。
    // 为了在回调函数中访问外部函数的 this，我们可以在外部函数开始时将 this 保存在 self 中，然后在回调函数中使用 self。
    var self = this
    let sound: Howl

    index = typeof index === "number" ? index : self.index
    var data = self.playlist[index]

    // If we already loaded this track, use the current one.
    // Otherwise, setup and load a new Howl.
    if (data.howl) {
      sound = data.howl
    } else {
      self.debug && console.log("new howl")
      sound = data.howl = new Howl({
        src: [data.url],
        html5: true, // Force to HTML5 so that the audio can stream in (best for large files).
        onplay() {
          self.resetInterval()
        },
        onload() {},
        onend() {},
        onpause() {},
        onstop() {},
        onseek() {
          // Start updating the progress of the track.
          self.resetInterval()
        },
      })
      // key 是索引: 0,1,2,3,... event是值 play, pause
      // 作用是将如上event，注册到sound对象，当事件被触发的时候，转发至self._emit处理
      // self._emit 会调用存储的events方法中的的回调函数去实现。
      for (const key in HowlEvents) {
        const event = HowlEvents[key]
        sound.on(event, (...args: any[]) => {
          self._emit(event, ...args)
        })
      }
    }
    // Begin playing the sound.
    !sound.playing() && sound.play()
    // Keep track of the index we are currently playing.
    self.index = index
  }

  /**
   * Pause the currently playing track.
   */
  pause() {
    this.debug && console.log("pause")
    var self = this

    // Get the Howl we want to manipulate.
    const sound = self.playlist[self.index].howl!

    // Pause the sound.
    sound.pause()
  }

  /**
   * Skip to the next or previous track.
   * @param  {String} direction 'next' or 'prev'.
   */
  skip(direction: "prev" | "next") {
    this.debug && console.log("skip")
    var self = this

    // Get the next track based on the direction of the track.
    var index = 0
    if (direction === "prev") {
      index = self.index - 1
      if (index < 0) {
        index = self.playlist.length - 1
      }
    } else {
      index = self.index + 1
      if (index >= self.playlist.length) {
        index = 0
      }
    }

    self.skipTo(index)
  }

  /**
   * Skip to a specific track based on its playlist index.
   * @param  {Number} index Index in the playlist.
   */
  skipTo(index: number) {
    this.debug && console.log("skipTo", index)
    var self = this

    // Stop the current track.
    self.playlist[self.index].howl?.stop()

    // Play the new track.
    self.play(index)
  }

  /**
   * Set the volume and update the volume slider display.
   * @param  {Number} val Volume between 0 and 1.
   */
  volume(val: number) {
    this.debug && console.log("volume", val)
    var self = this

    // Update the global volume (affecting all Howls).
    Howler.volume(val)

    // Update the display on the slider.
  }

  /**
   * Seek to a new position in the currently playing track.
   * @param  {Number} per Percentage through the song to skip.
   */
  seek(per: number) {
    this.debug && console.log("seek", per)
    var self = this

    // Get the Howl we want to manipulate.
    var sound = self.playlist[self.index].howl

    // Convert the percent into a seek position.
    if (sound?.playing()) {
      sound.seek(sound.duration() * per)
    }
  }

  // 重置定时器
  // interval 定时器ID
  resetInterval() {
    var self = this
    self.interval && clearInterval(self.interval)
    self.interval = window.setInterval(() => {
      self._step()
    }, self.timeout)
  }

  _step() {
    this.debug && console.log("step")
    var self = this
    // Get the Howl we want to manipulate.
    var sound = self.playlist[self.index].howl

    // Determine our current seek position.
    var seek = sound?.seek() || 0
    // const time = self.formatTime(Math.round(seek))
    const percent = (seek / sound?.duration()!) * 100 ?? 0
    // call step events
    self._emit("step", { seek, percent, playing: sound?.playing() ?? false })
  }

  get howl() {
    return this.playlist[this.index].howl!
  }

  // NOTE: 定义类型签名
  // 如下的三行是on函数的类型签名，在TS中类型签名是可选的。
  // on("load", ...): this
  // on("loaderror", ...): this
  // on("play"|...): this 都是签名
  // on(event: keyof Event, callback: Event[keyof Event]): this {...} 这是具体实现。
  on(event: "load", callback: () => void): this
  on(event: "loaderror" | "playerror", callback: HowlErrorCallback): this
  on(
    event:
      | "play"
      | "end"
      | "pause"
      | "stop"
      | "mute"
      | "volume"
      | "rate"
      | "seek"
      | "fade"
      | "unlock",
    callback: HowlCallback,
    id?: number
  ): this
  on(event: "step", callback: StepEvent): this
  // 注册到this.events[event]的列表中，如 "play":[fn1, fn2, fn3] play动作对应多个回调函数。
  on(event: keyof Event, callback: Event[keyof Event]): this {
    this.debug && console.log("on", event)
    this.events[event].push({
      callback: callback as any,
      once: false,
    })
    return this
  }
  once(event: "load", callback: () => void): this
  once(event: "loaderror" | "playerror", callback: HowlErrorCallback): this
  once(
    event:
      | "play"
      | "end"
      | "pause"
      | "stop"
      | "mute"
      | "volume"
      | "rate"
      | "seek"
      | "fade"
      | "unlock",
    callback: HowlCallback
  ): this
  once(event: keyof Event, callback: Event[keyof Event]): this {
    this.debug && console.log("once", event)
    this.events[event].push({
      callback: callback as any,
      once: true,
    })
    return this
  }
  off(event: "load", callback: () => void): this
  off(event: "loaderror" | "playerror", callback: HowlErrorCallback): this
  off(
    event:
      | "play"
      | "end"
      | "pause"
      | "stop"
      | "mute"
      | "volume"
      | "rate"
      | "seek"
      | "fade"
      | "unlock",
    callback: HowlCallback
  ): this
  off(event: keyof Event, callback: Event[keyof Event]): this {
    this.debug && console.log("off", event)
    this.events[event] = (this.events[event] as any).filter((e: any) => {
      return e.callback !== callback
    })
    return this
  }
  _emit(event: keyof Event, ...args: any[]) {
    this.debug && console.log("_emit", event)
    const self = this
    const events = self.events[event]
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i]
      const fn = e.callback as any
      fn(...args)
      // if e.once is true, it will remove callback function from specific event
      if (e.once) {
        self.off(event as any, e.callback as any)
      }
    }
  }
}
