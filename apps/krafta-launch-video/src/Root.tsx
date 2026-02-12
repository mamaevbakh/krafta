import {Composition, Folder} from 'remotion';

import {KraftaDemo} from './compositions/KraftaDemo';
import {KraftaLaunch} from './compositions/KraftaLaunch';

export const RemotionRoot = () => {
  return (
    <Folder name="Krafta">
      <Composition
        id="KraftaDemo"
        component={KraftaDemo}
        durationInFrames={30 * 30}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="KraftaLaunch"
        component={KraftaLaunch}
        durationInFrames={30 * 30}
        fps={30}
        width={1920}
        height={1080}
      />
    </Folder>
  );
};
