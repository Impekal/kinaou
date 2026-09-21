import type { KinaouAsset } from '../core/project'
import { AssetPlacementControl } from './AssetPlacementControl'
import type { MediaPreviewProps } from './MediaPreviewControl'
import { VideoProxyControl } from './VideoProxyControl'
import { VideoThumbnailControl } from './VideoThumbnailControl'
import { WaveformControl } from './WaveformControl'
import { useUiLanguage } from './UiLanguageProvider'

export type ProjectAssetListProps = Omit<MediaPreviewProps, 'asset'>

const kindKeys = {
  video: 'assetList.kind.video',
  image: 'assetList.kind.image',
  audio: 'assetList.kind.audio',
  caption: 'assetList.kind.caption',
  document: 'assetList.kind.document',
  other: 'assetList.kind.other',
} as const satisfies Record<KinaouAsset['kind'], string>

export function ProjectAssetList(props: ProjectAssetListProps) {
  const { project, onProjectChange } = props
  const { t } = useUiLanguage()

  return <div className="card">
    <div className="eyebrow">{t('assetList.projectAssets')}</div>
    {project.assets.length === 0
      ? <p className="cardBody">{t('assetList.empty')}</p>
      : <div className="assetList">
          {project.assets.map((asset) => <div className="assetRow assetRowWithPlacement" key={asset.id}>
            <div>
              <strong>{String(asset.metadata.name ?? asset.metadata.label ?? asset.id)}</strong>
              <small>{t(kindKeys[asset.kind])} · {t(asset.managed ? 'assetList.managed' : 'assetList.external')}</small>
              <VideoThumbnailControl {...props} asset={asset} />
              <WaveformControl {...props} asset={asset} />
            </div>
            <code>{asset.uri}</code>
            <span className={asset.offline ? 'badge offline' : 'badge'}>{t(asset.offline ? 'assetList.offline' : 'assetList.available')}</span>
            <div>
              <AssetPlacementControl project={project} asset={asset} onProjectChange={onProjectChange} />
              <VideoProxyControl {...props} asset={asset} />
            </div>
          </div>)}
        </div>}
  </div>
}
