import { config, isModelEnabled } from './config'
import { startServer } from './server'

/**
 * Process entry. Tests import `startServer` directly and do not run this file.
 */
startServer(config.port)
  .then(({ port }) => {
    const mode = isModelEnabled()
      ? `OpenAI polish on (${config.openAiModel})`
      : 'Answering from help notes'
    console.log(`Cove listening on http://localhost:${port}`)
    console.log(mode)
  })
  .catch((error: unknown) => {
    console.error(error)
    process.exit(1)
  })
