import { onUnmounted, ref } from 'vue'

export function useSpeech({ getText, getLanguage }) {
  const speaking = ref(false)
  let utterance = null

  function stop() {
    window.speechSynthesis?.cancel()
    speaking.value = false
    utterance = null
  }

  function toggle() {
    const text = getText()?.trim()
    const synthesis = window.speechSynthesis
    const Utterance = window.SpeechSynthesisUtterance
    if (!text || !synthesis || !Utterance) return

    if (speaking.value) {
      stop()
      return
    }

    synthesis.cancel()
    utterance = new Utterance(text)
    utterance.lang = getLanguage()
    utterance.onend = () => {
      speaking.value = false
      utterance = null
    }
    utterance.onerror = () => {
      speaking.value = false
      utterance = null
    }
    speaking.value = true
    synthesis.speak(utterance)
  }

  onUnmounted(stop)

  return {
    speaking,
    stop,
    toggle
  }
}
