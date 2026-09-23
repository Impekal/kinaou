import path from 'node:path'

const sha256Pattern =
  /^[a-f0-9]{64}$/

function record(
  value,
  label
) {
  if (
    !value
    || typeof value !== 'object'
    || Array.isArray(value)
  ) {
    throw new Error(
      `${label} must be an object`
    )
  }

  return value
}

function text(
  value,
  label,
  maximum = 1000
) {
  if (
    typeof value !== 'string'
    || !value.trim()
    || value.length > maximum
  ) {
    throw new Error(
      `${label} is invalid`
    )
  }

  return value
}

function managedAssetPath(
  value,
  label
) {
  text(value, label)

  if (
    value.includes('\\')
    || path.posix.normalize(value)
      !== value
    || !value.startsWith(
      'KINAOU/Assets/'
    )
    || value.split('/')
      .some(
        part =>
          !part
          || part === '.'
          || part === '..'
      )
  ) {
    throw new Error(
      `${label} must be a canonical managed asset path`
    )
  }

  return value
}

function receiptId(
  value
) {
  if (
    typeof value !== 'string'
    || !/^[A-Za-z0-9._-]{1,200}$/
      .test(value)
  ) {
    throw new Error(
      'Avatar receipt id is invalid'
    )
  }

  return value
}

export function validateAvatarReceiptExportDocument(
  value
) {
  const document =
    record(
      value,
      'Avatar receipt document'
    )

  if (
    document.schemaVersion !== 1
    || document.type
      !== 'kinaou-avatar-creation-receipt'
  ) {
    throw new Error(
      'Avatar receipt document identity is invalid'
    )
  }

  const project =
    record(
      document.project,
      'Avatar receipt project'
    )

  const avatar =
    record(
      document.avatar,
      'Avatar receipt identity'
    )

  const receipt =
    record(
      document.receipt,
      'Avatar receipt'
    )

  const output =
    record(
      document.output,
      'Avatar receipt output'
    )

  text(
    project.id,
    'Project id',
    200
  )

  text(
    project.title,
    'Project title',
    500
  )

  text(
    avatar.id,
    'Avatar id',
    200
  )

  text(
    avatar.name,
    'Avatar name',
    200
  )

  text(
    avatar.versionId,
    'Avatar version id',
    200
  )

  text(
    avatar.versionLabel,
    'Avatar version label',
    300
  )

  const id =
    receiptId(
      receipt.id
    )

  if (
    receipt.avatarId
      !== avatar.id
    || receipt.versionId
      !== avatar.versionId
  ) {
    throw new Error(
      'Avatar receipt lineage is inconsistent'
    )
  }

  if (
    output.id
      !== receipt.outputAssetId
    || ![
      'image',
      'video'
    ].includes(output.kind)
  ) {
    throw new Error(
      'Avatar receipt output identity is inconsistent'
    )
  }

  managedAssetPath(
    output.uri,
    'Avatar receipt output path'
  )

  if (
    !Array.isArray(
      document.sources
    )
    || document.sources.length > 32
  ) {
    throw new Error(
      'Avatar receipt sources are invalid'
    )
  }

  const sources =
    document.sources.map(
      sourceValue => {
        const source =
          record(
            sourceValue,
            'Avatar receipt source'
          )

        return {
          id: text(
            source.id,
            'Avatar source id',
            200
          ),
          kind: text(
            source.kind,
            'Avatar source kind',
            50
          ),
          uri:
            managedAssetPath(
              source.uri,
              'Avatar source path'
            )
        }
      }
    )

  const sourceIds =
    sources.map(
      source => source.id
    )

  if (
    new Set(sourceIds).size
      !== sourceIds.length
  ) {
    throw new Error(
      'Avatar receipt source identities must be unique'
    )
  }

  const receiptSources =
    receipt.sourceAssetIds

  if (
    !Array.isArray(
      receiptSources
    )
    || receiptSources.length
      !== sources.length
    || new Set(
      receiptSources
    ).size
      !== receiptSources.length
    || receiptSources.some(
      idValue =>
        !sourceIds.includes(
          idValue
        )
    )
  ) {
    throw new Error(
      'Avatar receipt source lineage is inconsistent'
    )
  }

  return structuredClone(
    document
  )
}

export function avatarReceiptRelativePath(
  document
) {
  const checked =
    validateAvatarReceiptExportDocument(
      document
    )

  return (
    'KINAOU/Receipts/Avatars/'
    + receiptId(
      checked.receipt.id
    )
    + '.json'
  )
}

export function finalizeAvatarReceiptDocument(
  document,
  evidence
) {
  const checked =
    validateAvatarReceiptExportDocument(
      document
    )

  const capturedAt =
    text(
      evidence?.capturedAt,
      'Avatar evidence time',
      100
    )

  const output =
    record(
      evidence?.output,
      'Avatar output evidence'
    )

  if (
    !Number.isInteger(
      output.sizeBytes
    )
    || output.sizeBytes <= 0
    || typeof output.sha256
      !== 'string'
    || !sha256Pattern.test(
      output.sha256
    )
  ) {
    throw new Error(
      'Avatar output evidence is invalid'
    )
  }

  if (
    !Array.isArray(
      evidence?.sources
    )
    || evidence.sources.length
      !== checked.sources.length
  ) {
    throw new Error(
      'Avatar source evidence is incomplete'
    )
  }

  const byId =
    new Map(
      evidence.sources.map(
        source => [
          source.id,
          source
        ]
      )
    )

  const sources =
    checked.sources.map(
      source => {
        const actual =
          byId.get(source.id)

        if (
          !actual
          || actual.path
            !== source.uri
          || !Number.isInteger(
            actual.sizeBytes
          )
          || actual.sizeBytes <= 0
          || typeof actual.sha256
            !== 'string'
          || !sha256Pattern.test(
            actual.sha256
          )
        ) {
          throw new Error(
            'Avatar source evidence does not match the receipt lineage'
          )
        }

        return {
          ...source,
          sizeBytes:
            actual.sizeBytes,
          sha256:
            actual.sha256
        }
      }
    )

  return {
    ...checked,
    evidence: {
      capturedAt
    },
    output: {
      ...checked.output,
      sizeBytes:
        output.sizeBytes,
      sha256:
        output.sha256
    },
    sources
  }
}

export function existingAvatarReceiptMatches(
  existing,
  finalized
) {
  try {
    const left =
      record(
        existing,
        'Existing avatar receipt'
      )

    if (
      left.schemaVersion !== 1
      || left.type
        !== 'kinaou-avatar-creation-receipt'
      || left.receipt?.id
        !== finalized.receipt.id
      || left.receipt?.jobId
        !== finalized.receipt.jobId
      || left.avatar?.id
        !== finalized.avatar.id
      || left.avatar?.versionId
        !== finalized.avatar.versionId
      || left.output?.id
        !== finalized.output.id
      || left.output?.uri
        !== finalized.output.uri
      || left.output?.sha256
        !== finalized.output.sha256
    ) {
      return false
    }

    const existingSources =
      Array.isArray(
        left.sources
      )
        ? left.sources
        : []

    if (
      existingSources.length
        !== finalized.sources.length
    ) {
      return false
    }

    const byId =
      new Map(
        existingSources.map(
          source => [
            source?.id,
            source
          ]
        )
      )

    return finalized.sources.every(
      source => {
        const previous =
          byId.get(source.id)

        return (
          previous?.uri
            === source.uri
          && previous?.sha256
            === source.sha256
        )
      }
    )
  } catch {
    return false
  }
}
