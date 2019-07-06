import React, { Component, Children } from 'react';
import { StyleSheet, Dimensions } from 'react-native';
import Animated from 'react-native-reanimated';
import {
  PanGestureHandler,
  State,
  PanGestureHandlerProperties,
} from 'react-native-gesture-handler';

const {
  event,
  block,
  Value,
  divide,
  lessOrEq,
  greaterOrEq,
  cond,
  eq,
  add,
  stopClock,
  Clock,
  set,
  clockRunning,
  spring,
  startClock,
  multiply,
  lessThan,
  onChange,
  debug,
  neq,
  sub,
  greaterThan,
  call,
  and,
  diffClamp,
  max,
  min,
} = Animated;

const { width: screenWidth } = Dimensions.get('window');

export interface PagerProps {
  index: number;
  onChange: (nextIndex: number) => void;
  width: number;
  type: 'stack' | 'tabs';
  max: number;
  pan?: Partial<PanGestureHandlerProperties>;
}

class Pager extends Component<PagerProps> {
  dragX = new Value(0);
  releasedAt = new Value(0);
  gestureState = new Value(0);
  translateX = new Value(0);
  minIndex = new Value(0);
  maxIndex = new Value(this.props.max);

  index = new Value(this.props.index);

  static defaultProps = {
    width: screenWidth,
    max: 1,
  };

  constructor(props: PagerProps) {
    super(props);

    const percentDragged = divide(this.dragX, props.width);
    const threshold = 0.2;
    const isRight = lessOrEq(percentDragged, -threshold);
    const isLeft = greaterOrEq(percentDragged, threshold);

    const snapIndex = new Value(this.props.index);
    const clampedSnap = min(max(snapIndex, this.minIndex), this.maxIndex);

    this.translateX = block([
      onChange(this.index, [
        set(snapIndex, this.index),
        call([this.index], ([index]) => this.props.onChange(index)),
      ]),

      cond(
        eq(this.gestureState, State.ACTIVE),

        [
          set(
            snapIndex,
            add(this.index, cond(isRight, 1, cond(isLeft, -1, 0)))
          ),
          this.dragX,
        ],
        [set(this.index, clampedSnap), set(this.dragX, 0)]
      ),

      this.dragX,
    ]) as any;
  }

  handleGesture = event(
    [
      {
        nativeEvent: {
          translationX: this.dragX,
        },
      },
    ],
    { useNativeDriver: true }
  );

  handleStateChange = event(
    [
      {
        nativeEvent: {
          state: this.gestureState,
        },
      },
    ],
    {
      useNativeDriver: true,
    }
  );

  componentDidUpdate(prevProps) {
    if (prevProps.index !== this.props.index) {
      requestAnimationFrame(() => {
        this.index.setValue(this.props.index as any);
      });
    }

    if (prevProps.max !== this.props.max) {
      requestAnimationFrame(() => {
        this.maxIndex.setValue(this.props.max);
      });
    }
  }

  render() {
    const { children, width, type, pan } = this.props;
    return (
      <PanGestureHandler
        {...pan}
        onGestureEvent={this.handleGesture}
        onHandlerStateChange={this.handleStateChange}
      >
        <Animated.View style={{ flex: 1, overflow: 'hidden' }}>
          {Children.map(children, (element, index) => (
            <PagerView
              index={index}
              initialIndex={this.props.index}
              activeIndex={this.index}
              width={width}
              gestureState={this.gestureState}
              dragX={this.translateX}
              type={type}
            >
              {element}
            </PagerView>
          ))}
        </Animated.View>
      </PanGestureHandler>
    );
  }
}

function getToValue(index, activeIndex, width) {
  const difference = index - activeIndex;
  const clamped = Math.max(-0.3, Math.min(difference, 1));
  const toValue = width * clamped;
  return toValue;
}

class PagerView extends Component<any> {
  clock = new Clock();

  dx = new Value(
    getToValue(this.props.index, this.props.initialIndex, this.props.width)
  );

  translateX = new Value(0);

  static defaultProps = {
    type: 'stack',
  };

  constructor(props) {
    super(props);

    if (props.type === 'tabs') {
      const difference = sub(this.props.index, this.props.activeIndex);
      const clamped = max(-1, min(difference, 1));

      const absoluteOffset = multiply(difference, this.props.width);
      const toValue = multiply(this.props.width, clamped);

      this.translateX = block([
        onChange(this.props.dragX, []),

        cond(
          eq(this.props.gestureState, State.ACTIVE),
          [set(this.dx, add(absoluteOffset, this.props.dragX))],
          [this.runSpring(this.clock, toValue)]
        ),

        this.dx,
      ]) as any;
    } else {
      const difference = sub(this.props.index, this.props.activeIndex);
      const clamped = max(-0.3, min(difference, 1));
      const toValue = multiply(this.props.width, clamped);

      this.translateX = block([
        onChange(this.props.dragX, []),

        cond(
          and(eq(difference, 0), eq(this.props.gestureState, State.ACTIVE)),
          [set(this.dx, this.props.dragX)],
          [this.runSpring(this.clock, toValue)]
        ),

        this.dx,
      ]) as any;
    }
  }

  runSpring = (clock: any, toValue: any) => {
    const state = {
      finished: new Value(0),
      velocity: new Value(0),
      position: this.dx,
      time: new Value(0),
    };

    const config = {
      stiffness: 1000,
      damping: 500,
      mass: 3,
      overshootClamping: false,
      restDisplacementThreshold: 0.01,
      restSpeedThreshold: 0.01,
      toValue: new Value(0),
    };

    return block([
      cond(
        clockRunning(clock),
        [
          cond(neq(config.toValue, toValue), [
            set(config.toValue, toValue),
            set(state.time, 0),
            set(state.finished, 0),
          ]),
        ],
        [
          [
            set(state.finished, 0),
            set(state.time, 0),
            set(config.toValue, toValue),
            startClock(clock),
          ],
        ]
      ),

      spring(clock, state, config),

      cond(state.finished, [set(this.dx, config.toValue), stopClock(clock)]),
    ]);
  };

  render() {
    const { children } = this.props;

    return (
      <Animated.View
        style={{
          ...StyleSheet.absoluteFillObject,
          transform: [{ translateX: this.translateX as any }],
        }}
      >
        {children}
      </Animated.View>
    );
  }
}

export { Pager };