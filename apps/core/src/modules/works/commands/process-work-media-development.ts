import { reportWorkMediaProcessorFailure, runWorkMediaProcessor } from './process-work-media';

void runWorkMediaProcessor({ isContinuous: true }).catch(reportWorkMediaProcessorFailure);
