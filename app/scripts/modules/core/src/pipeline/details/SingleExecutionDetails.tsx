import * as React from 'react';
import * as ReactGA from 'react-ga';
import { BindAll } from 'lodash-decorators';
import { Subscription } from 'rxjs';
import { UISref } from '@uirouter/react';

import { Application } from 'core/application/application.model';
import { IExecution } from 'core/domain';
import { Execution } from 'core/pipeline/executions/execution/Execution';
import { IScheduler } from 'core/scheduler';
import { ReactInjector, IStateChange } from 'core/reactShims';
import { Tooltip } from 'core/presentation';
import { ISortFilter } from 'core/filterModel';
import { ExecutionState } from 'core/state';

import './singleExecutionDetails.less';

export interface ISingleExecutionDetailsProps {
  app: Application;
}

export interface ISingleExecutionDetailsState {
  execution: IExecution;
  sortFilter: ISortFilter;
  stateNotFound: boolean;
}

export interface ISingleExecutionStateParams {
  application: string;
  executionId: string;
}

export interface ISingleExecutionRouterStateChange extends IStateChange {
  fromParams: ISingleExecutionStateParams;
  toParams: ISingleExecutionStateParams;
}

@BindAll()
export class SingleExecutionDetails extends React.Component<
  ISingleExecutionDetailsProps,
  ISingleExecutionDetailsState
> {
  private executionScheduler: IScheduler;
  private executionLoader: Subscription;
  private stateChangeSuccessSubscription: Subscription;

  constructor(props: ISingleExecutionDetailsProps) {
    super(props);

    this.state = {
      execution: null,
      sortFilter: ExecutionState.filterModel.asFilterModel.sortFilter,
      stateNotFound: false,
    };
  }

  private getExecution() {
    const { executionService, $state, schedulerFactory } = ReactInjector;
    const { app } = this.props;

    if (!app || app.notFound) {
      return;
    }

    executionService.getExecution($state.params.executionId).then(
      execution => {
        const stateExecution = this.state.execution || execution;
        executionService.transformExecution(app, execution);
        executionService.synchronizeExecution(stateExecution, execution);
        if (execution.isActive && !this.executionScheduler) {
          this.executionScheduler = schedulerFactory.createScheduler(5000);
          this.executionLoader = this.executionScheduler.subscribe(() => this.getExecution());
        }
        if (!execution.isActive && this.executionScheduler) {
          this.executionScheduler.unsubscribe();
          this.executionLoader.unsubscribe();
        }
        this.setState({ execution: stateExecution });
      },
      () => {
        this.setState({ execution: null, stateNotFound: true });
      },
    );
  }

  public componentDidMount(): void {
    this.stateChangeSuccessSubscription = ReactInjector.stateEvents.stateChangeSuccess.subscribe(
      (stateChange: ISingleExecutionRouterStateChange) => {
        if (
          !stateChange.to.name.includes('pipelineConfig') &&
          (stateChange.toParams.application !== stateChange.fromParams.application ||
            stateChange.toParams.executionId !== stateChange.fromParams.executionId)
        ) {
          this.getExecution();
        }
      },
    );
    this.getExecution();
  }

  public componentWillUnmount(): void {
    if (this.executionScheduler) {
      this.executionScheduler.unsubscribe();
    }
    if (this.executionLoader) {
      this.executionLoader.unsubscribe();
    }
    this.stateChangeSuccessSubscription.unsubscribe();
  }

  private showDurationsChanged(event: React.ChangeEvent<HTMLInputElement>): void {
    const checked = event.target.checked;
    // TODO: Since we treat sortFilter like a store, we can force the setState for now
    //       but we should eventually convert all the sortFilters to be a valid redux
    //       (or similar) store.
    this.state.sortFilter.showDurations = checked;
    this.setState({ sortFilter: this.state.sortFilter });
    ReactGA.event({ category: 'Pipelines', action: 'Toggle Durations', label: checked.toString() });
  }

  private handleConfigureClicked(e: React.MouseEvent<HTMLElement>): void {
    ReactGA.event({ category: 'Execution', action: 'Configuration' });
    ReactInjector.$state.go('^.pipelineConfig', {
      application: this.props.app.name,
      pipelineId: this.state.execution.pipelineConfigId,
    });
    e.stopPropagation();
  }

  public render() {
    const { app } = this.props;
    const { execution, sortFilter, stateNotFound } = this.state;

    return (
      <div style={{ width: '100%', paddingTop: 0 }}>
        {execution && (
          <div className="row">
            <div className="col-md-10 col-md-offset-1">
              <div className="single-execution-details">
                <div className="flex-container-h baseline">
                  <h3>
                    <Tooltip value="Back to Executions">
                      <UISref to="^.executions.execution" params={{ application: app.name, executionId: execution.id }}>
                        <a className="btn btn-configure">
                          <span className="glyphicon glyphicon glyphicon-circle-arrow-left" />
                        </a>
                      </UISref>
                    </Tooltip>
                    {execution.name}
                  </h3>

                  <div className="form-group checkbox flex-pull-right">
                    <label>
                      <input
                        type="checkbox"
                        checked={sortFilter.showDurations || false}
                        onChange={this.showDurationsChanged}
                      />
                      <span> stage durations</span>
                    </label>
                  </div>
                  <Tooltip value="Navigate to Pipeline Configuration">
                    <UISref
                      to="^.pipelineConfig"
                      params={{ application: this.props.app.name, pipelineId: this.state.execution.pipelineConfigId }}
                    >
                      <button
                        className="btn btn-sm btn-default"
                        onClick={this.handleConfigureClicked}
                        style={{ marginRight: '5px' }}
                      >
                        <span className="glyphicon glyphicon-cog" />
                        <span className="visible-md-inline visible-lg-inline"> Configure</span>
                      </button>
                    </UISref>
                  </Tooltip>
                </div>
              </div>
            </div>
          </div>
        )}
        {execution && (
          <div className="row">
            <div className="col-md-10 col-md-offset-1 executions">
              <Execution
                execution={execution}
                application={app}
                standalone={true}
                showDurations={sortFilter.showDurations}
              />
            </div>
          </div>
        )}
        {stateNotFound && (
          <div className="row" style={{ minHeight: '300px' }}>
            <h4 className="text-center">
              <p>The execution cannot be found.</p>
              <UISref to="^.executions" params={{ application: app.name }}>
                <a>Back to Executions.</a>
              </UISref>
            </h4>
          </div>
        )}
      </div>
    );
  }
}
