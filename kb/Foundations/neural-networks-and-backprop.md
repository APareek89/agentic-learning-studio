---
title: Neural Networks and Backpropagation
category: Foundations
url: https://d2l.ai/chapter_multilayer-perceptrons/backprop.html
license: CC-BY-SA-4.0
as_of_date: 2026-06-22
sources:
  - {url: https://d2l.ai/chapter_multilayer-perceptrons/index.html, license: CC-BY-SA-4.0, kind: educational_textbook}
  - {url: https://d2l.ai/chapter_multilayer-perceptrons/backprop.html, license: CC-BY-SA-4.0, kind: educational_textbook}
  - {url: https://github.com/d2l-ai/d2l-en, license: CC-BY-SA-4.0, kind: oss_repo}
---

## What it is

A neural network is a parameterized function built from layers. Each layer transforms numbers into new numbers; the whole stack maps inputs to predictions. Backpropagation is the training procedure that computes how much each parameter contributed to the current error so an optimizer can adjust the parameters.

For agent builders, this is the machinery underneath pretraining, fine-tuning, adapters, embedding models, rerankers, classifiers, speech models, vision models, and most modern generative systems.

## Why it exists / when to reach for it

Neural networks exist because hand-written rules cannot cover the variation in language, images, audio, and user behavior. Instead of coding every decision boundary, we choose a model shape, define a training signal, and let data fit the parameters.

Reach for this concept when a learner asks why models need data, what a loss curve means, how fine-tuning differs from prompting, why overfitting happens, or why a model can improve on a benchmark while still failing real users.

## The moving parts

- Parameters: weights and biases learned during training.
- Activations: intermediate values produced by each layer.
- Nonlinearities: functions such as ReLU or GELU that let the network represent more than one big linear transform.
- Loss function: a numerical measure of how wrong the prediction is for the current task.
- Computational graph: the record of operations needed to compute gradients.
- Gradients: derivatives that estimate how changing each parameter would affect the loss.
- Optimizer: the update rule, such as stochastic gradient descent or Adam.
- Train, validation, and test splits: separate data views for fitting, tuning, and final evaluation.

## How it works

Training alternates between a forward pass and a backward pass. In the forward pass, a batch of inputs moves through the network and produces predictions. The loss function compares predictions with target labels, next tokens, rankings, or another training signal.

Backpropagation then applies the chain rule from the loss back through the computational graph. Each operation contributes local derivative information, and the chain of derivatives gives a gradient for every parameter that influenced the loss. The optimizer uses those gradients to take a small update step. Repeating the loop across many batches gradually shapes the network toward lower training loss.

Automatic differentiation libraries make this practical. Developers usually define the forward computation and loss; the framework records the graph and computes the gradients.

## When to use vs alternatives

Use neural networks when the task benefits from learned representations: language understanding, perception, generation, retrieval embeddings, ranking, and noisy pattern recognition. Use simpler models or rules when the task is small, highly regulated, easy to specify, or needs strong interpretability. Use prompting or RAG when the base model already has the capability and the main problem is instruction, context, or facts rather than new learned behavior.

## Failure modes & gotchas

- Overfitting: training loss improves while generalization gets worse.
- Data leakage: validation or test examples sneak into training, making metrics look inflated.
- Vanishing or exploding gradients: updates become too small to learn or too unstable to control.
- Bad learning rates: too low wastes compute; too high can skip useful minima or diverge.
- Objective mismatch: the loss rewards something that is only loosely related to product quality.
- Dataset bias: the model reproduces gaps and skew in the training data.
- Catastrophic forgetting: fine-tuning can damage earlier capabilities.

## Minimal code shape

```pseudo
for batch in training_data:
  predictions = model.forward(batch.inputs)
  loss = loss_fn(predictions, batch.targets)

  gradients = autodiff.backward(loss, model.parameters)
  optimizer.update(model.parameters, gradients)

  metrics.log(loss, evaluate(model, validation_sample))
```

## Key links

- https://d2l.ai/chapter_multilayer-perceptrons/index.html
- https://d2l.ai/chapter_multilayer-perceptrons/backprop.html
- https://github.com/d2l-ai/d2l-en
