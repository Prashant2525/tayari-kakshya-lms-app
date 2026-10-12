import { blank, match, mcq, multi, num, subj, tf } from '../questions.ts';
import type { PackCourse } from '../types.ts';

/** Deep Learning foundations (B.Tech CSE, Semester 7): original notes and questions (D-071). */
export const deepLearning: PackCourse = {
  key: 'dl',
  slug: 'deep-learning',
  title: { en: 'Deep Learning Foundations', ne: 'डिप लर्निङका आधार' },
  shortDescription: {
    en: 'Machine-learning types, TensorFlow, linear models, gradient descent, perceptrons, activation functions and hands-on labs.',
    ne: 'मेसिन लर्निङका प्रकार, TensorFlow, लिनियर मोडेल, ग्रेडियन्ट डिसेन्ट, पर्सेप्ट्रोन, एक्टिभेसन फङ्सन र अभ्यास।',
  },
  description: `
## What you will learn
A practical foundation for deep learning, from machine-learning basics to your first neural networks:

- Supervised, unsupervised and reinforcement learning
- TensorFlow and Keras, computational graphs, backpropagation and TensorBoard
- Linear classifiers, Bayes' theorem, linear and logistic regression, loss functions
- Gradient descent, worked step by step
- Neural networks, the single-layer perceptron, and activation functions
- Lab exercises with scikit-learn and the MNIST dataset

Worked numerical examples, code you can run, chapter quizzes and a timed **subject test**.

> The first chapter is free.
`,
  semester: 'semester-7',
  isFeatured: true,
  popularityRank: 3,
  subject: {
    key: 'dl-subject',
    name: { en: 'Deep Learning', ne: 'डिप लर्निङ' },
    summary: {
      en: 'Machine-learning types, TensorFlow, linear models, optimisation, neural networks and labs.',
      ne: 'मेसिन लर्निङका प्रकार, TensorFlow, लिनियर मोडेल, अप्टिमाइजेसन, न्युरल नेटवर्क र अभ्यास।',
    },
  },
  chapters: [
    {
      key: 'dl-ch1',
      numberLabel: '1',
      title: { en: 'Types of Machine Learning', ne: 'मेसिन लर्निङका प्रकार' },
      description: 'Supervised, unsupervised and reinforcement learning, with algorithms and applications.',
      topics: [
        {
          key: 'dl-ch1-t1',
          title: { en: 'Machine learning and supervised learning', ne: 'मेसिन लर्निङ र सुपरभाइज्ड लर्निङ' },
          estimatedMinutes: 20,
          note: `
## Machine learning
**Machine learning (ML)** is a branch of artificial intelligence in which computers **learn from data** and improve with experience, instead of being explicitly programmed for every task. Systems are trained on past data to recognise patterns and make predictions — especially useful for large datasets.

Main types: **supervised**, **unsupervised** and **reinforcement** learning. **Semi-supervised** learning combines a little labelled data with a lot of unlabelled data.

## Supervised learning
The model learns from a **labelled dataset** — each input comes with the correct output (label). The goal is to learn the **mapping from inputs to outputs** so it can predict labels for new data.

- Data is split into a **training set** and a **validation (or test) set**; the validation set checks how well the model **generalises** to unseen data.
- **Example:** train on labelled photos of cats and dogs; the model then classifies new photos.

### Two kinds of supervised problems
| | Classification | Regression |
|---|---|---|
| Predicts | A **category** (discrete label) | A **number** (continuous value) |
| Examples | Spam / not spam; disease risk high / low | House price; next month's sales |
| Algorithms | Logistic regression, SVM, decision tree, random forest, k-nearest neighbours, naive Bayes | Linear, polynomial, ridge and lasso regression; decision tree; random forest |

### Pros and cons
| Advantages | Disadvantages |
|---|---|
| Often high accuracy | Labelling data is slow and costly |
| Decisions are often interpretable | Struggles with patterns not in the training data |
| Pre-trained models save time | May generalise poorly to new data |

**Applications:** image classification, speech recognition, NLP, recommendation, medical diagnosis, fraud detection, spam filtering, credit scoring, weather forecasting, quality control.
`,
          questions: [
            mcq(
              'Predicting the price of a house from its size and location is a…',
              ['classification problem', 'regression problem', 'clustering problem', 'reinforcement problem'],
              1,
              'The output is a continuous number, so it is regression.',
              'easy',
            ),
            mcq(
              'What makes learning **supervised**?',
              [
                'There is no data',
                'The training data has correct output labels',
                'An agent receives rewards',
                'Data is grouped into clusters',
              ],
              1,
              'Supervised learning learns from input–label pairs.',
              'easy',
            ),
            multi(
              'Which algorithms are commonly used for **classification**?',
              ['Logistic regression', 'Support vector machine', 'K-nearest neighbours', 'Linear regression'],
              [0, 1, 2],
              'Linear regression predicts continuous values.',
            ),
            tf(
              'A validation set is used to check how well a model generalises to data it has not been trained on.',
              true,
              'It estimates performance on unseen data.',
              'easy',
            ),
          ],
        },
        {
          key: 'dl-ch1-t2',
          title: {
            en: 'Unsupervised and reinforcement learning',
            ne: 'अनसुपरभाइज्ड र रिइन्फोर्समेन्ट लर्निङ',
          },
          estimatedMinutes: 20,
          note: `
## Unsupervised learning
The algorithm works with **unlabelled data** — no correct answers are given. It must find **hidden patterns, structures or relationships** by itself.

**Example:** group shop customers by purchase behaviour to discover segments, without knowing the segments in advance.

| Task | What it does | Algorithms |
|---|---|---|
| **Clustering** | Groups similar data points | K-means, mean-shift, DBSCAN |
| **Association** | Finds rules like "people who buy A also buy B" | Apriori, Eclat, FP-growth |
| **Dimensionality reduction** | Compresses features while keeping information | PCA, ICA, autoencoders |

| Advantages | Disadvantages |
|---|---|
| No labelling needed | Hard to measure the quality of results |
| Finds hidden structure | Clusters may be hard to interpret |

**Applications:** customer segmentation, anomaly detection, recommendation, topic modelling, market-basket analysis, image segmentation, genomics, community detection, exploratory data analysis.

## Reinforcement learning (RL)
An **agent** interacts with an **environment** by taking **actions**, and learns from **rewards** (or penalties) by **trial and error**. Feedback is often **delayed**. The goal is to learn a **policy** that maximises the **cumulative reward**.

**Examples:** self-driving cars learning to drive safely; **AlphaGo** (DeepMind) mastering the game of Go by playing humans and itself.

| Algorithm | Idea |
|---|---|
| **Q-learning** | Model-free; learns a Q-function estimating the expected reward of an action in a state; updates towards the best next action |
| **SARSA** | Model-free; like Q-learning but updates using the action actually taken (state–action–reward–state–action) |
| **Deep Q-learning** | Uses a neural network to represent the Q-function for complex state spaces |

## Comparing the three
| | Supervised | Unsupervised | Reinforcement |
|---|---|---|---|
| Data | Labelled | Unlabelled | Rewards from interaction |
| Goal | Predict labels | Find structure | Maximise cumulative reward |
| Example | Spam filter | Customer segments | Game-playing agent |
`,
          questions: [
            mcq(
              'Grouping customers by purchase behaviour without predefined groups is an example of…',
              ['regression', 'clustering', 'reinforcement learning', 'classification'],
              1,
              'Clustering is unsupervised grouping of similar points.',
              'easy',
            ),
            match(
              'Match each algorithm with its learning task.',
              [
                ['K-means', 'Clustering'],
                ['Apriori', 'Association rules'],
                ['Q-learning', 'Reinforcement learning'],
                ['Logistic regression', 'Classification'],
              ],
              'Each algorithm belongs to a different family.',
            ),
            mcq(
              'How does SARSA differ from Q-learning?',
              [
                'SARSA needs labelled data',
                'SARSA updates using the action actually taken rather than the best possible next action',
                'SARSA is a clustering algorithm',
                'SARSA does not use rewards',
              ],
              1,
              'SARSA is on-policy; Q-learning updates towards the optimal action.',
              'hard',
            ),
            tf(
              'In reinforcement learning, the agent aims to maximise the cumulative reward.',
              true,
              'The learned policy maximises long-term reward.',
              'easy',
            ),
          ],
        },
      ],
      revision: `
- **ML:** learn from data rather than explicit rules.
- **Supervised:** labelled data; **classification** (categories) vs **regression** (numbers).
- **Unsupervised:** unlabelled data; clustering (K-means, DBSCAN), association (Apriori, FP-growth), dimensionality reduction (PCA).
- **Reinforcement:** agent, environment, actions, rewards; maximise cumulative reward; Q-learning, SARSA, deep Q-learning.
`,
    },
    {
      key: 'dl-ch2',
      numberLabel: '2',
      title: { en: 'TensorFlow and Computational Graphs', ne: 'TensorFlow र कम्प्युटेसनल ग्राफ' },
      description: 'Building a neural network in Keras, forward and backward passes, and TensorBoard.',
      topics: [
        {
          key: 'dl-ch2-t1',
          title: { en: 'TensorFlow and a first neural network', ne: 'TensorFlow र पहिलो न्युरल नेटवर्क' },
          estimatedMinutes: 25,
          note: `
## What TensorFlow is
**TensorFlow** is an open-source machine-learning library from **Google Brain**. It supports deep learning, reinforcement learning and classical ML, offers the high-level **Keras** API as well as low-level control, runs on **CPUs and GPUs**, includes visualisation through **TensorBoard**, and has a large community.

TensorFlow builds a **computational graph** of operations on data and runs it efficiently.

## The usual workflow
1. Import TensorFlow and libraries
2. Prepare the data
3. Build the model
4. **Compile** — choose the loss function, optimiser and metrics
5. **Train** (fit)
6. **Evaluate** on test data
7. **Predict**

## Example: classifying handwritten digits (MNIST)
\`\`\`python
import tensorflow as tf
from tensorflow.keras.datasets import mnist
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import Dense, Flatten
from tensorflow.keras.utils import to_categorical

(x_train, y_train), (x_test, y_test) = mnist.load_data()
x_train, x_test = x_train / 255.0, x_test / 255.0      # scale pixels to 0..1
y_train, y_test = to_categorical(y_train), to_categorical(y_test)

model = Sequential([
    Flatten(input_shape=(28, 28)),       # 28x28 image -> 784 values
    Dense(128, activation='relu'),       # hidden layer
    Dense(10, activation='softmax'),     # one output per digit
])
model.compile(optimizer='adam', loss='categorical_crossentropy', metrics=['accuracy'])
model.fit(x_train, y_train, epochs=5, batch_size=32)
loss, accuracy = model.evaluate(x_test, y_test)
\`\`\`

| Piece | Role |
|---|---|
| Flatten | Turns the 28×28 image into a 784-long vector |
| Dense(128, relu) | Fully connected hidden layer; ReLU adds non-linearity |
| Dense(10, softmax) | Output probabilities for the 10 digits (they sum to 1) |
| Adam | An efficient gradient-descent optimiser |
| Categorical cross-entropy | Loss for multi-class classification with one-hot labels |

> With integer labels (not one-hot) use **sparse_categorical_crossentropy** instead.
`,
          questions: [
            mcq(
              'Which organisation developed TensorFlow?',
              ['Meta AI', 'Google Brain', 'OpenAI', 'Microsoft Research'],
              1,
              'TensorFlow is an open-source library from Google Brain.',
              'easy',
            ),
            num(
              'An MNIST image of 28 × 28 pixels is flattened into a vector of how many values?',
              784,
              '28 × 28 = 784.',
              'easy',
            ),
            mcq(
              'Which activation is used in the output layer to give probabilities over 10 classes that sum to 1?',
              ['ReLU', 'Sigmoid', 'Softmax', 'Tanh'],
              2,
              'Softmax turns scores into a probability distribution.',
            ),
            match(
              'Match each Keras step with its purpose.',
              [
                ['compile', 'Choose loss, optimiser and metrics'],
                ['fit', 'Train the model on data'],
                ['evaluate', 'Measure loss and accuracy on test data'],
                ['predict', 'Get outputs for new inputs'],
              ],
              'The standard Keras workflow.',
            ),
            tf(
              'Pixel values are divided by 255 so that they lie between 0 and 1, which helps training.',
              true,
              'Normalisation speeds up and stabilises training.',
              'easy',
            ),
          ],
        },
        {
          key: 'dl-ch2-t2',
          title: {
            en: 'Computational graphs and backpropagation',
            ne: 'कम्प्युटेसनल ग्राफ र ब्याकप्रोपागेसन',
          },
          estimatedMinutes: 25,
          note: `
## Computational graphs
A **computational graph** is a directed graph whose **nodes are operations** and whose edges carry values. It is a way of expressing and evaluating a mathematical expression.

**Example:** g = (x + y) × z, written as two nodes:

- p = x + y
- g = p × z

## Forward pass
Evaluate the graph from inputs (left) to output (right).
With **x = 1, y = 3, z = −3**:

- p = 1 + 3 = **4**
- g = 4 × (−3) = **−12**

## Backward pass (backpropagation)
Now find how the output changes with each input — the **gradients** — which training needs.

1. Start at the output: ∂g/∂g = **1**.
2. Local derivatives of g = p × z: ∂g/∂p = z = **−3**, ∂g/∂z = p = **4**.
3. Local derivatives of p = x + y: ∂p/∂x = 1, ∂p/∂y = 1.
4. **Chain rule:** ∂g/∂x = ∂g/∂p × ∂p/∂x = −3 × 1 = **−3**; similarly ∂g/∂y = **−3**.

| Variable | Value | Gradient of g |
|---|---|---|
| x | 1 | −3 |
| y | 3 | −3 |
| z | −3 | 4 |

Going **backwards** is efficient: each gradient reuses values already computed further along the graph plus a **local** derivative — local information gives a global result.

## Training loop
1. **Forward pass** with an input to compute the cost (loss).
2. **Backward pass** from the cost to get gradients for every node, including the weights.
3. **Update** each weight: *W = W − learning rate × gradient*.
4. Repeat until a stopping criterion is met.
`,
          questions: [
            num(
              'For g = (x + y) × z with x = 1, y = 3 and z = −3, what is g after the forward pass?',
              -12,
              'p = 1 + 3 = 4; g = 4 × (−3) = −12.',
              'easy',
            ),
            num('For the same graph (x = 1, y = 3, z = −3), what is ∂g/∂z?', 4, '∂g/∂z = p = x + y = 4.'),
            num('For the same graph, what is ∂g/∂x?', -3, 'Chain rule: ∂g/∂x = ∂g/∂p × ∂p/∂x = z × 1 = −3.'),
            mcq(
              'In gradient-based training, each weight is updated as…',
              [
                'W = W + learning rate × gradient',
                'W = W − learning rate × gradient',
                'W = gradient ÷ learning rate',
                'W = 0 after every step',
              ],
              1,
              'We move against the gradient to reduce the loss.',
              'easy',
            ),
            blank(
              'Backpropagation computes gradients efficiently using the [[b1]] rule of differentiation.',
              { b1: ['chain'] },
              'The chain rule multiplies local derivatives along the path.',
              'easy',
            ),
          ],
        },
        {
          key: 'dl-ch2-t3',
          title: { en: 'Visualising training with TensorBoard', ne: 'TensorBoard मार्फत तालिम हेर्ने' },
          estimatedMinutes: 15,
          note: `
## What TensorBoard does
**TensorBoard** is TensorFlow's visualisation tool. It helps you watch and understand training:

- **Scalars** — loss, accuracy, learning rate and other values per epoch
- **Graphs** — the model's structure, to check it is built correctly
- **Histograms and distributions** — how weights and biases change over time

## How it works
During training a **callback** writes event logs to a folder; TensorBoard reads that folder and shows the dashboards in your browser.

\`\`\`python
import datetime
from tensorflow.keras.callbacks import TensorBoard

log_dir = "logs/fit/" + datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
tensorboard = TensorBoard(log_dir=log_dir, histogram_freq=1)
model.fit(x_train, y_train, epochs=5,
          validation_data=(x_test, y_test), callbacks=[tensorboard])
\`\`\`

Then in a terminal:

\`\`\`bash
tensorboard --logdir=logs/fit
\`\`\`

and open **http://localhost:6006** in the browser.

## Practice task
Train a small MNIST classifier with the callback, then look at: training vs validation **loss** and **accuracy** curves, and the model **graph**. If validation loss starts rising while training loss keeps falling, the model is beginning to **overfit**.

Write a short reflection (five or six sentences): what did the curves show, when did learning slow down, and what would you change — more epochs, a smaller learning rate, or a bigger hidden layer?
`,
          questions: [
            mcq(
              'Which TensorBoard dashboard shows loss and accuracy per epoch?',
              ['Graphs', 'Scalars', 'Histograms', 'Projector'],
              1,
              'Scalars plot values such as loss and accuracy over time.',
              'easy',
            ),
            num(
              'On which port does TensorBoard serve its dashboards by default?',
              6006,
              'TensorBoard runs at http://localhost:6006.',
              'easy',
            ),
            tf(
              'If validation loss rises while training loss keeps falling, the model may be overfitting.',
              true,
              'It is memorising the training data rather than generalising.',
            ),
          ],
        },
      ],
      revision: `
- **TensorFlow** (Google Brain): Keras API, CPU/GPU, TensorBoard. Workflow: data → build → compile → fit → evaluate → predict.
- MNIST: Flatten (784) → Dense(128, ReLU) → Dense(10, softmax); Adam; categorical cross-entropy.
- **Computational graph:** nodes are operations. Forward pass computes the output; **backward pass** computes gradients with the **chain rule**.
- Example g = (x+y)z, x=1, y=3, z=−3: g = −12; ∂g/∂x = ∂g/∂y = −3; ∂g/∂z = 4.
- Update: **W = W − learning rate × gradient**.
- **TensorBoard:** scalars, graphs, histograms; \`tensorboard --logdir=...\`, port 6006.
`,
    },
    {
      key: 'dl-ch3',
      numberLabel: '3',
      title: { en: 'Linear Models and Probability', ne: 'लिनियर मोडेल र सम्भाव्यता' },
      description:
        "Linear classifiers, Bayes' theorem and naive Bayes, SVMs, linear and logistic regression, and loss functions.",
      topics: [
        {
          key: 'dl-ch3-t1',
          title: { en: 'Linear classifiers, Bayes and SVMs', ne: 'लिनियर क्लासिफायर, बेज र SVM' },
          estimatedMinutes: 25,
          note: `
## Linear classifiers
A **linear classifier** predicts a class using a **linear decision boundary** — a line, plane or hyperplane that separates the classes. Common binary linear classifiers: **logistic regression**, **naive Bayes** and the **linear support vector classifier**; **kernelised SVMs** handle non-linear boundaries.

## Logistic regression
Despite its name, it is a **classifier**. It predicts the **probability** of the positive class by passing a linear score through the **sigmoid** function, giving an S-shaped curve between 0 and 1. Use it for binary problems where you want a probability — e.g. is a tumour malignant or benign?

## Conditional probability and Bayes' theorem
- **Conditional probability:** P(A | B) = P(A ∩ B) ÷ P(B), the probability of A given that B happened.
- **Example:** 27 students study Chemistry and 13 of them also study Biology, so P(Biology | Chemistry) = 13/27.
- **Bayes' theorem:** P(A | B) = P(B | A) × P(A) ÷ P(B), with P(B) ≠ 0.

### Worked example
Bag I has 4 white and 6 black balls; Bag II has 4 white and 3 black. A bag is chosen at random and a ball drawn — it is black. What is the probability it came from Bag I?

- P(Bag I) = P(Bag II) = 1/2
- P(black | Bag I) = 6/10 = 3/5; P(black | Bag II) = 3/7
- P(Bag I | black) = (1/2 × 3/5) ÷ (1/2 × 3/5 + 1/2 × 3/7) = (3/5) ÷ (3/5 + 3/7) = (21/35) ÷ (36/35) = **7/12 ≈ 0.583**

## Naive Bayes classifier
A probabilistic classifier based on Bayes' theorem. It is **naive** because it assumes all features are **independent** given the class — rarely exactly true, but it works well, especially for text (e.g. sentiment classification). Good for **small datasets** and **fast** classification.

## Support vector machines
- A **linear SVC** finds the boundary with the **maximum margin** — the largest distance to the nearest points of each class. Those nearest points are the **support vectors**; only they define the boundary, which limits the effect of outliers. Good for large, linearly separable and sparse data.
- A **kernelised SVM** maps data into a higher-dimensional space (via a **kernel**) where it becomes linearly separable, finds a hyperplane there, and maps it back — solving **non-linear** problems with a linear method. Works well for text and images.
`,
          questions: [
            num(
              'In a class, 27 students study Chemistry and 13 of them also study Biology. What is P(Biology | Chemistry)? Give the answer to 3 decimal places.',
              0.481,
              'P(B | C) = 13/27 ≈ 0.481.',
              'medium',
              0.001,
            ),
            num(
              'Bag I: 4 white, 6 black. Bag II: 4 white, 3 black. A bag is chosen at random and a black ball drawn. What is the probability it came from Bag I? (3 decimal places)',
              0.583,
              'P = (3/5) ÷ (3/5 + 3/7) = 7/12 ≈ 0.583.',
              'hard',
              0.002,
            ),
            mcq(
              'Why is the naive Bayes classifier called "naive"?',
              [
                'It ignores the training data',
                'It assumes the features are independent of each other given the class',
                'It can only predict two classes',
                'It never uses probabilities',
              ],
              1,
              'The independence assumption is the "naive" part.',
            ),
            mcq(
              'In a linear support vector classifier, the support vectors are…',
              [
                'all training points',
                'the points nearest the decision boundary',
                'the misclassified points only',
                'the cluster centres',
              ],
              1,
              'Only the points closest to the boundary determine it.',
            ),
            tf(
              'Despite its name, logistic regression is used for classification.',
              true,
              'It predicts a class probability through the sigmoid function.',
              'easy',
            ),
          ],
        },
        {
          key: 'dl-ch3-t2',
          title: {
            en: 'Linear and logistic regression, loss functions',
            ne: 'लिनियर र लजिस्टिक रिग्रेसन, लस फङ्सन',
          },
          estimatedMinutes: 25,
          note: `
## Linear regression
Fits a straight line **y = m x + b** (slope m, intercept b) that best predicts a continuous output.

### Least-squares formulas
- m = Σ (x − x̄)(y − ȳ) ÷ Σ (x − x̄)²
- b = ȳ − m x̄

### Worked example: pizza price
For a set of pizzas the slope works out to **m = 12/8 = 1.5** and the means are x̄ = 10 inches, ȳ = 13 dollars, so **b = 13 − 1.5 × 10 = −2**. The model is **price = 1.5 × diameter − 2**; a 20-inch pizza is predicted at 1.5 × 20 − 2 = **28** dollars.

## Logistic regression
For a binary outcome (0/1), logistic regression models
**P(y = 1) = σ(m x + b)**, where **σ(z) = 1 ÷ (1 + e^−z^)** is the sigmoid. Predict 1 when the probability is 0.5 or more.

**Example:** a study of age and diabetes — ages 30, 35, 40 had no diabetes (0), ages 50, 55 had diabetes (1). Logistic regression learns the age at which the probability crosses 0.5, somewhere between 40 and 50.

## Loss functions for regression
A **loss function** measures how far predictions ŷ are from the targets y; training minimises it.

| Loss | Formula (average over n points) | Notes |
|---|---|---|
| **Mean squared error (MSE)** | Σ (y − ŷ)² ÷ n | Most common; squares punish large errors; smooth and differentiable |
| **Mean absolute error (MAE)** | Σ abs(y − ŷ) ÷ n | Treats all errors equally; more **robust to outliers** |
| **Root mean squared error (RMSE)** | √MSE | Same unit as y |
| **Huber loss** | Squared for small errors (abs(e) ≤ δ); linear for large ones | Combines MSE's smoothness with MAE's robustness |
| **Log-cosh** | Σ log(cosh(y − ŷ)) ÷ n | Like MSE but less affected by outliers |

### Quick example
Targets 3, 5, 7; predictions 2, 5, 9. Errors: 1, 0, −2.
MSE = (1 + 0 + 4) ÷ 3 = **1.67**; MAE = (1 + 0 + 2) ÷ 3 = **1.0**.

For classification the usual losses are **binary cross-entropy** and **categorical cross-entropy**.
`,
          questions: [
            num(
              'A linear model predicts pizza price = 1.5 × diameter − 2 (dollars). What is the predicted price of a 20-inch pizza?',
              28,
              '1.5 × 20 − 2 = 28.',
              'easy',
            ),
            num(
              'Targets are 3, 5 and 7; predictions are 2, 5 and 9. What is the mean absolute error (MAE)?',
              1,
              'Absolute errors 1, 0, 2 → mean = 3 ÷ 3 = 1.',
            ),
            num(
              'Targets are 3, 5 and 7; predictions are 2, 5 and 9. What is the mean squared error (MSE)? (2 decimal places)',
              1.67,
              'Squared errors 1, 0, 4 → 5 ÷ 3 ≈ 1.67.',
              'medium',
              0.01,
            ),
            mcq(
              'Which regression loss is **most robust to outliers**?',
              [
                'Mean squared error',
                'Mean absolute error',
                'Squared error without averaging',
                'Cross-entropy',
              ],
              1,
              'MAE does not square errors, so one large error has less influence.',
            ),
            mcq(
              'What is the value of the sigmoid function σ(0)?',
              ['0', '0.5', '1', 'Infinity'],
              1,
              'σ(0) = 1 ÷ (1 + 1) = 0.5.',
              'easy',
            ),
            blank(
              'Huber loss behaves like squared error for small errors and like [[b1]] error for large ones.',
              { b1: ['absolute', 'linear'] },
              'It combines MSE near zero with MAE-like behaviour for outliers.',
              'hard',
            ),
          ],
        },
      ],
      revision: `
- **Linear classifier:** linear decision boundary. Logistic regression, naive Bayes, linear SVC; kernel SVM for non-linear data.
- **Bayes:** P(A|B) = P(B|A) P(A) ÷ P(B). Ball example: P(Bag I | black) = 7/12.
- **Naive Bayes:** assumes independent features; fast; good for text.
- **SVM:** maximum margin; support vectors are the nearest points; kernels for non-linear problems.
- **Linear regression:** y = mx + b; m = Σ(x−x̄)(y−ȳ) ÷ Σ(x−x̄)², b = ȳ − m x̄.
- **Logistic regression:** P = σ(mx + b), σ(0) = 0.5.
- **Losses:** MSE (punishes large errors), MAE (robust), RMSE, Huber, log-cosh; cross-entropy for classification.
`,
    },
    {
      key: 'dl-ch4',
      numberLabel: '4',
      title: { en: 'Gradient Descent', ne: 'ग्रेडियन्ट डिसेन्ट' },
      description: 'How gradient descent minimises a loss, with a full worked iteration and Python code.',
      topics: [
        {
          key: 'dl-ch4-t1',
          title: { en: 'Gradient descent, step by step', ne: 'ग्रेडियन्ट डिसेन्ट, क्रमैसँग' },
          estimatedMinutes: 30,
          note: `
## The idea
**Gradient descent** minimises a loss function by repeatedly moving the parameters a small step **against the gradient** — downhill.

1. **Initialise** the parameters (zeros or small random values).
2. **Compute the gradient** of the loss with respect to each parameter.
3. **Update:** θ = θ − α × ∂L/∂θ, where **α is the learning rate**.
4. **Repeat** until the loss stops decreasing (convergence).

- Too large a learning rate → overshoots and may diverge; too small → very slow.
- **Batch** gradient descent uses all data per step; **stochastic (SGD)** uses one example; **mini-batch** uses a small batch.

## Gradients for simple linear regression
Model ŷ = m x + c with loss MSE = (1/N) Σ (y − ŷ)²:

- ∂L/∂m = (−2/N) Σ x (y − ŷ)
- ∂L/∂c = (−2/N) Σ (y − ŷ)

## Worked example (one iteration)
A shopkeeper's item prices over five months:

| Month x | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| Price y (Rs) | 50 | 52 | 54 | 56 | 58 |

Start with **m = 0, c = 0**, learning rate **α = 0.01**, one iteration of batch gradient descent.

1. Predictions are all 0, so errors (y − ŷ) are 50, 52, 54, 56, 58.
2. Σ (y − ŷ) = **270**; Σ x (y − ŷ) = 50 + 104 + 162 + 224 + 290 = **830**.
3. ∂L/∂m = (−2/5) × 830 = **−332**; ∂L/∂c = (−2/5) × 270 = **−108**.
4. m = 0 − 0.01 × (−332) = **3.32**; c = 0 − 0.01 × (−108) = **1.08**.

After one iteration the model is ŷ = 3.32 x + 1.08. (The best fit is y = 2x + 48; many more iterations are needed to get there.)

## In Python
\`\`\`python
import numpy as np

x = np.array([1, 2, 3, 4, 5])
y = np.array([3, 5, 7, 9, 11])      # true line: y = 2x + 1
m, c, alpha, epochs = 0.0, 0.0, 0.01, 1000
N = len(x)
for _ in range(epochs):
    y_pred = m * x + c
    dm = (-2 / N) * np.sum(x * (y - y_pred))
    dc = (-2 / N) * np.sum(y - y_pred)
    m -= alpha * dm
    c -= alpha * dc
print(m, c)                          # close to 2 and 1
\`\`\`
`,
          questions: [
            num(
              'Prices y = 50, 52, 54, 56, 58 for months x = 1…5. Starting from m = 0, c = 0 with learning rate 0.01, what is m after one iteration of batch gradient descent? (2 decimal places)',
              3.32,
              '∂L/∂m = (−2/5) × 830 = −332; m = 0 − 0.01 × (−332) = 3.32.',
              'hard',
              0.01,
            ),
            num(
              'Same data and settings: what is c after one iteration? (2 decimal places)',
              1.08,
              '∂L/∂c = (−2/5) × 270 = −108; c = 0 − 0.01 × (−108) = 1.08.',
              'hard',
              0.01,
            ),
            mcq(
              'What happens if the learning rate is far too large?',
              [
                'Training becomes very slow',
                'Updates overshoot and the loss may diverge',
                'The gradient becomes zero',
                'Nothing changes',
              ],
              1,
              'Large steps jump past the minimum and can blow up.',
            ),
            match(
              'Match each variant with the data it uses per update.',
              [
                ['Batch gradient descent', 'The whole training set'],
                ['Stochastic gradient descent', 'One training example'],
                ['Mini-batch gradient descent', 'A small batch of examples'],
              ],
              'The variants trade accuracy of each step against speed.',
            ),
            tf(
              'Gradient descent moves the parameters in the direction of the gradient to increase the loss.',
              false,
              'It moves against the gradient to decrease the loss.',
              'easy',
            ),
          ],
        },
      ],
      revision: `
- Update rule: **θ = θ − α ∂L/∂θ**; α = learning rate (too big diverges, too small is slow).
- Batch (all data), stochastic (one example), mini-batch (small batch).
- Linear regression gradients: ∂L/∂m = (−2/N) Σ x(y − ŷ), ∂L/∂c = (−2/N) Σ (y − ŷ).
- Shop example, one step from 0 with α = 0.01: **m = 3.32, c = 1.08**.
`,
    },
    {
      key: 'dl-ch5',
      numberLabel: '5',
      title: { en: 'Neural Networks and Perceptrons', ne: 'न्युरल नेटवर्क र पर्सेप्ट्रोन' },
      description:
        'How neural networks learn, the single-layer perceptron with a worked OR-gate example, and activation functions.',
      topics: [
        {
          key: 'dl-ch5-t1',
          title: { en: 'How neural networks work', ne: 'न्युरल नेटवर्कले कसरी काम गर्छ' },
          estimatedMinutes: 25,
          note: `
## Structure
A **neural network** is a model inspired by the brain: layers of connected **neurons (nodes)**.

- **Input layer** — one neuron per input feature.
- **Hidden layers** — do the computation with weights, biases and activation functions. The number of hidden layers is the **depth**; many layers make a network "deep".
- **Output layer** — the final prediction (a class, a probability or a number).

Key components: neurons, connections, **weights and biases**, propagation functions, and a **learning rule** that adjusts weights.

## How it learns
1. **Forward propagation** — each neuron computes a **weighted sum plus bias**, z = w·x + b, then an **activation** a = f(z), passing results layer by layer to the output.
2. **Loss** — compare the output with the target (MSE for regression, cross-entropy for classification).
3. **Backpropagation** — compute the gradient of the loss with respect to every weight and bias using the **chain rule**.
4. **Weight update** — adjust weights against the gradient with an optimiser such as **SGD** or **Adam**, scaled by the learning rate.
5. **Iterate** over the data for many epochs.

## Types of neural networks
| Type | Use |
|---|---|
| Feedforward network | Data flows one way, input to output |
| Single-layer perceptron | One layer of weights; linear binary classification |
| Multilayer perceptron (MLP) | Input, one or more hidden layers, output; non-linear activations |
| Convolutional neural network (CNN) | Images — learns features with convolutional layers |
| Recurrent neural network (RNN) | Sequences — loops keep context over time |
| Long short-term memory (LSTM) | An RNN with gates for long-term dependencies; avoids vanishing gradients |

## Building one in Keras
\`\`\`python
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import Dense

model = Sequential()
model.add(Dense(8, input_dim=2, activation='relu'))   # hidden layer
model.add(Dense(1, activation='sigmoid'))             # binary output
model.compile(loss='binary_crossentropy', optimizer='adam', metrics=['accuracy'])
model.fit(X, y, epochs=100, batch_size=1)
label = (model.predict([[0.2, 0.4]]) > 0.5).astype(int)
\`\`\`

| Advantages | Disadvantages |
|---|---|
| Learn complex, non-linear relationships | Computationally expensive to train |
| Excellent at pattern recognition (images, speech, text) | "Black box" — hard to explain decisions |
| Adapt to new data | Can overfit; need large labelled datasets |
`,
          questions: [
            mcq(
              'Which network type is designed mainly for **images**?',
              ['RNN', 'CNN', 'LSTM', 'Single-layer perceptron'],
              1,
              'Convolutional layers learn image features.',
              'easy',
            ),
            mcq(
              'Which network type handles **long-term dependencies** in sequences using gates?',
              ['CNN', 'LSTM', 'Feedforward network', 'Perceptron'],
              1,
              'LSTM cells have gates that keep long-term information and avoid vanishing gradients.',
            ),
            tf(
              'In forward propagation, each neuron computes a weighted sum of its inputs plus a bias, then applies an activation function.',
              true,
              'z = w·x + b, then a = f(z).',
              'easy',
            ),
            multi(
              'Which are disadvantages of neural networks?',
              [
                'They can be hard to interpret',
                'They need a lot of computation to train',
                'They may overfit',
                'They cannot model non-linear patterns',
              ],
              [0, 1, 2],
              'Modelling non-linear patterns is one of their strengths.',
            ),
          ],
        },
        {
          key: 'dl-ch5-t2',
          title: { en: 'The single-layer perceptron', ne: 'एकल-तह पर्सेप्ट्रोन' },
          estimatedMinutes: 30,
          note: `
## The perceptron
Proposed by **Frank Rosenblatt in 1958**, the perceptron is one of the first neural networks. A single-layer perceptron has one layer of weights, no hidden layer and one output, and does **binary classification** (output 0 or 1).

- **Inputs** x~1~ … x~n~, each with a **weight** w~i~
- A **bias** b that shifts the threshold
- **Weighted sum:** z = Σ w~i~ x~i~ + b
- **Step activation:** output 1 if z ≥ 0, otherwise 0

## Learning rule
For each training example: compute the output, find **error = target − prediction**, and update

- w~i~ = w~i~ + α × error × x~i~
- b = b + α × error

Repeat over the data (epochs) until every example is classified correctly.

## Worked example: learning the OR gate
Start with w~1~ = 0, w~2~ = 0, b = 0, learning rate α = 1.

| Step | x~1~ | x~2~ | Target | z | Prediction | Error | New w~1~, w~2~, b |
|---|---|---|---|---|---|---|---|
| 1 | 0 | 0 | 0 | 0 | 1 | −1 | 0, 0, −1 |
| 2 | 0 | 1 | 1 | −1 | 0 | 1 | 0, 1, 0 |
| 3 | 1 | 0 | 1 | 0 | 1 | 0 | no change |
| 4 | 1 | 1 | 1 | 1 | 1 | 0 | no change |

In the **second epoch** every prediction is correct, so training stops with **w~1~ = 0, w~2~ = 1, b = 0**.

## The XOR limitation
A single-layer perceptron draws **one straight line**, so it can learn only **linearly separable** functions such as AND and OR. **XOR is not linearly separable** — no single line separates (0,1) and (1,0) from (0,0) and (1,1) — so the perceptron never converges on it. A **multilayer** network with a hidden layer solves XOR.

## A perceptron on MNIST
\`\`\`python
from tensorflow import keras
model = keras.Sequential([keras.layers.Dense(10, input_shape=(784,), activation='sigmoid')])
model.compile(optimizer='adam', loss='sparse_categorical_crossentropy', metrics=['accuracy'])
\`\`\`
Even this single layer reaches **over 90% accuracy** on MNIST; adding hidden layers or using a CNN does better.
`,
          questions: [
            mcq(
              'Who proposed the perceptron, and when?',
              ['Geoffrey Hinton, 1986', 'Frank Rosenblatt, 1958', 'Alan Turing, 1950', 'Yann LeCun, 1998'],
              1,
              'Frank Rosenblatt introduced the perceptron in 1958.',
              'easy',
            ),
            tf(
              'A single-layer perceptron can learn the XOR function.',
              false,
              'XOR is not linearly separable; a hidden layer is needed.',
            ),
            num(
              'A perceptron has w1 = 0, w2 = 0, b = 0 and learning rate 1, with a step activation (output 1 if z ≥ 0). For input (0, 0) with target 0, what is the new bias after the update?',
              -1,
              'z = 0 → prediction 1; error = 0 − 1 = −1; b = 0 + 1 × (−1) = −1.',
            ),
            num(
              'Training the OR gate from all-zero weights (learning rate 1) ends with w1 = 0, w2 = 1 and b = ? ',
              0,
              'After the second example the bias returns to 0 and no further updates are needed.',
              'hard',
            ),
            multi(
              'Which logic functions can a single-layer perceptron learn?',
              ['AND', 'OR', 'XOR', 'NOT'],
              [0, 1, 3],
              'AND, OR and NOT are linearly separable; XOR is not.',
            ),
            subj(
              'Train a single-layer perceptron for the AND gate (w1 = w2 = b = 0, learning rate 1, step activation) for two epochs and show the weight updates.',
              `**Epoch 1** (start 0, 0, 0):
- (0,0) target 0: z = 0 → 1, error −1 → b = −1.
- (0,1) target 0: z = −1 → 0, no change.
- (1,0) target 0: z = −1 → 0, no change.
- (1,1) target 1: z = −1 → 0, error 1 → w1 = 1, w2 = 1, b = 0.

**Epoch 2** (1, 1, 0):
- (0,0): z = 0 → 1, error −1 → b = −1.
- (0,1): z = 0 → 1, error −1 → w2 = 0, b = −2.
- (1,0): z = −1 → 0, no change.
- (1,1): z = −1 → 0, error 1 → w1 = 2, w2 = 1, b = −1.

Training continues in later epochs until all four cases are correct (e.g. w1 = 2, w2 = 1, b = −3 works).`,
              'hard',
            ),
          ],
        },
        {
          key: 'dl-ch5-t3',
          title: { en: 'Activation functions', ne: 'एक्टिभेसन फङ्सन' },
          estimatedMinutes: 20,
          note: `
## Why activation functions?
Without a non-linear activation, any stack of layers collapses into a single **linear** model. Activation functions add **non-linearity**, transform features, affect how **gradients flow** in backpropagation, and can **bound outputs** (e.g. to 0–1).

## The common ones
| Function | Formula | Output range | Typical use |
|---|---|---|---|
| **Sigmoid** | 1 ÷ (1 + e^−x^) | 0 to 1 | Binary classification output (a probability) |
| **Tanh** | (e^x^ − e^−x^) ÷ (e^x^ + e^−x^) | −1 to 1 | Hidden layers; zero-centred |
| **ReLU** | max(0, x) | 0 to ∞ | Default for hidden layers |
| **Softmax** | e^x~i~^ ÷ Σ e^x~j~^ | 0 to 1, summing to 1 | Multi-class output layer |

### Sigmoid
- σ(0) = **0.5**; large positive inputs → close to 1; large negative → close to 0.
- Smooth gradient; output reads as a probability.
- Problems: **vanishing gradients** for large positive or negative inputs, and outputs are **not zero-centred**, which slows learning.

### ReLU (rectified linear unit)
- Passes positive values unchanged and sets negatives to 0.
- **Cheap** to compute; **sparse** activations (many neurons output 0); derivative is simply **0 or 1**, which **avoids the vanishing-gradient problem** of sigmoid and tanh.
- Most popular choice for hidden layers.

### Tanh
Like sigmoid but outputs from −1 to 1, centring data around zero — often learns faster than sigmoid.

### Softmax
Turns a vector of scores into **probabilities that add up to 1** — the higher the score, the higher the probability. Used in the output layer for multi-class problems (e.g. 10 MNIST digits).
`,
          questions: [
            mcq(
              'What is ReLU(−3)?',
              ['−3', '0', '3', '0.5'],
              1,
              'ReLU(x) = max(0, x), so negative inputs give 0.',
              'easy',
            ),
            num('What is ReLU(4.5)?', 4.5, 'Positive inputs pass through unchanged.', 'easy'),
            match(
              'Match each activation function with its output range.',
              [
                ['Sigmoid', '0 to 1'],
                ['Tanh', '−1 to 1'],
                ['ReLU', '0 to infinity'],
              ],
              'Ranges follow from the formulas.',
            ),
            mcq(
              'Which activation function most suffers from the **vanishing gradient** problem for large inputs?',
              ['ReLU', 'Sigmoid', 'Linear', 'None of them'],
              1,
              'Sigmoid saturates near 0 and 1, where its derivative is tiny.',
            ),
            tf(
              'The outputs of softmax always add up to 1.',
              true,
              'Softmax produces a probability distribution.',
              'easy',
            ),
          ],
        },
      ],
      revision: `
- Layers: input, hidden (depth), output. Learning: forward pass → loss → backprop (chain rule) → weight update (SGD/Adam) → repeat.
- Types: feedforward, perceptron, MLP, **CNN (images)**, **RNN (sequences)**, **LSTM (long-term memory)**.
- **Perceptron** (Rosenblatt, 1958): z = Σ wx + b, step output; update w += α·error·x, b += α·error. OR gate ends at w1 = 0, w2 = 1, b = 0.
- Single layer → only **linearly separable** problems; **XOR needs a hidden layer**.
- Activations: **sigmoid** (0–1, vanishing gradient), **tanh** (−1–1), **ReLU** max(0,x) (default hidden), **softmax** (multi-class probabilities).
`,
    },
    {
      key: 'dl-ch6',
      numberLabel: '6',
      title: { en: 'Lab: Regression with scikit-learn', ne: 'अभ्यास: scikit-learn सँग रिग्रेसन' },
      description: 'Hands-on exercises: linear and logistic regression on small datasets and on MNIST.',
      topics: [
        {
          key: 'dl-ch6-t1',
          title: { en: 'Linear and logistic regression exercises', ne: 'लिनियर र लजिस्टिक रिग्रेसन अभ्यास' },
          estimatedMinutes: 40,
          note: `
## Exercise 1 — predict marks from study hours (linear regression)
Hours studied **[1, 2, 3, 4, 5]**, marks **[25, 45, 50, 60, 75]**.

\`\`\`python
import numpy as np
from sklearn.linear_model import LinearRegression

X = np.array([[1], [2], [3], [4], [5]])
y = np.array([25, 45, 50, 60, 75])
model = LinearRegression().fit(X, y)
print(model.coef_[0], model.intercept_)   # slope 11.5, intercept 16.5
print(model.predict([[6]]))               # about 85.5 marks
\`\`\`

The fitted line is **marks = 11.5 × hours + 16.5**, so 6 hours predicts **85.5** marks.

## Exercise 2 — pass or fail from study hours (logistic regression)
Hours **[1…6]**, results **[0, 0, 0, 1, 1, 1]** (fail ≤ 3 hours, pass ≥ 4).

\`\`\`python
from sklearn.linear_model import LogisticRegression

X = np.array([[1], [2], [3], [4], [5], [6]])
y = np.array([0, 0, 0, 1, 1, 1])
clf = LogisticRegression().fit(X, y)
print(clf.predict([[2]]), clf.predict([[5]]))   # [0] [1]
print(clf.predict_proba([[3.5]]))               # close to 50 / 50
\`\`\`

## Exercise 3 — will a customer buy? (logistic regression)
Ages **[18, 22, 25, 30, 35, 40, 45]**, bought **[0, 0, 0, 1, 1, 1, 1]**. The model learns a boundary between 25 and 30, so age 23 is predicted **0** (will not buy).

## Exercise 4 — classify MNIST digits as "0" or "not 0"
\`\`\`python
from tensorflow.keras.datasets import mnist
from sklearn.metrics import accuracy_score

(X_train, y_train), (X_test, y_test) = mnist.load_data()
X_train = X_train.reshape(-1, 784) / 255.0
X_test = X_test.reshape(-1, 784) / 255.0
y_train0 = (y_train == 0).astype(int)
y_test0 = (y_test == 0).astype(int)
clf = LogisticRegression(max_iter=1000).fit(X_train, y_train0)
print(accuracy_score(y_test0, clf.predict(X_test)))   # about 0.99
\`\`\`

Changing the target to **y % 2** gives an **even vs odd** classifier — a much harder task (about 0.90 accuracy), because the evenness of a digit is not a simple pattern of pixels.

## Things to notice
- \`fit\` learns parameters; \`predict\` returns classes; \`predict_proba\` returns probabilities.
- Always **scale** pixel values (÷ 255) and **reshape** images to rows of 784 features.
- **Accuracy alone can mislead:** only about 10% of digits are "0", so always predicting "not 0" already scores about 90%.
`,
          questions: [
            num(
              'A linear model fitted to study hours and marks is marks = 11.5 × hours + 16.5. How many marks does it predict for 6 hours?',
              85.5,
              '11.5 × 6 + 16.5 = 85.5.',
              'easy',
            ),
            mcq(
              'Which scikit-learn method returns **class probabilities** rather than class labels?',
              ['fit', 'predict', 'predict_proba', 'score'],
              2,
              'predict_proba gives the probability of each class.',
            ),
            mcq(
              'In "digit is 0 vs not 0" on MNIST, why can a model with 90% accuracy still be useless?',
              [
                'Because MNIST has no zeros',
                'Because about 90% of digits are not 0, so always answering "not 0" already scores about 90%',
                'Because accuracy cannot exceed 90%',
                'Because logistic regression cannot handle images',
              ],
              1,
              'With imbalanced classes, compare against the trivial baseline.',
              'hard',
            ),
            mcq(
              'Customers aged 18, 22 and 25 did not buy; those aged 30, 35, 40 and 45 did. What does a logistic-regression model predict for a 23-year-old?',
              ['0 — will not buy', '1 — will buy', 'Exactly 0.5', 'It cannot predict'],
              0,
              'The learned boundary lies between 25 and 30, so 23 falls on the "did not buy" side.',
              'easy',
            ),
            tf(
              'In the study-hours exercise, the slope of 11.5 means each extra hour of study adds about 11.5 marks.',
              true,
              'The slope is the change in marks per extra hour.',
              'easy',
            ),
            blank(
              'Before training on MNIST with scikit-learn, each 28 × 28 image is reshaped into a row of [[b1]] features.',
              { b1: ['784'] },
              '28 × 28 = 784.',
              'easy',
            ),
          ],
        },
      ],
      revision: `
- Linear regression on hours → marks: **marks = 11.5 h + 16.5**; 6 h → 85.5.
- Logistic regression predicts classes; \`predict_proba\` gives probabilities.
- MNIST with scikit-learn: reshape to 784 features, divide by 255.
- "0 vs not 0" ≈ 99% accuracy; "even vs odd" ≈ 90%. Watch out for **class imbalance** when reading accuracy.
`,
    },
  ],
};
